import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { isAdminRole } from "@/lib/admin-capabilities";
import { credentialToAuthEmail, normalizeLoginId } from "@/lib/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { trackStepMission } from "@/lib/step-events";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";
const TEMP_PASSWORD = "DynamicD2026!reset";

const schema = z.object({
  loginId: z.string().trim().min(1),
  password: z.string().min(1),
  nextPath: z.string().optional(),
  browserFingerprint: z.string().trim().max(120).optional().default(""),
});

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const meta = requestMeta(request);
  const limited = await enforceRateLimit(`login:v160:${meta.ip}`, 10, 60 * 10);
  if (limited) return limited;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("아이디와 비밀번호를 확인해 주세요.", 422, "VALIDATION_ERROR");

  const supabase = await createClient();
  const admin = createAdminClient();
  const fingerprint = String(parsed.data.browserFingerprint || "unknown").slice(0, 120);
  const credential = credentialToAuthEmail(parsed.data.loginId);
  const loginValue = String(parsed.data.loginId || "").trim().toLowerCase();
  const normalizedLoginId = normalizeLoginId(loginValue);

  await admin.from("login_activity_logs").insert({
    login_id: parsed.data.loginId,
    ip_address: meta.ip,
    browser_fingerprint: fingerprint,
    status: "TRYING",
    user_agent: meta.userAgent,
  });

  let signInEmail = credential;
  let signInResult = await supabase.auth.signInWithPassword({ email: signInEmail, password: parsed.data.password });
  let data = signInResult.data;
  let error = signInResult.error;

  // 복구 모드: 기존 auth.users에 비밀번호가 없던 계정은 임시 비밀번호로 1회 로그인 가능하게 만든다.
  // 조건: profiles.must_change_password = true 이고 입력 비밀번호가 TEMP_PASSWORD일 때만 작동.
  if ((error || !data.user) && parsed.data.password === TEMP_PASSWORD) {
    let recoveryProfile: { id: string; email: string | null; username: string | null; status: string | null; must_change_password?: boolean | null } | null = null;

    if (loginValue.includes("@")) {
      const { data: byEmail } = await admin
        .from("profiles")
        .select("id,email,username,status,must_change_password")
        .eq("email", loginValue)
        .maybeSingle();
      recoveryProfile = byEmail;
    } else {
      const { data: byUsername } = await admin
        .from("profiles")
        .select("id,email,username,status,must_change_password")
        .eq("username", normalizedLoginId)
        .maybeSingle();
      recoveryProfile = byUsername;
    }

    if (recoveryProfile?.must_change_password && recoveryProfile.status === "APPROVED") {
      const recoveryEmail = String(recoveryProfile.email || credential).toLowerCase();
      const updateResult = await admin.auth.admin.updateUserById(recoveryProfile.id, {
        email: recoveryEmail,
        password: TEMP_PASSWORD,
      });

      if (!updateResult.error) {
        signInEmail = recoveryEmail;
        signInResult = await supabase.auth.signInWithPassword({ email: signInEmail, password: TEMP_PASSWORD });
        data = signInResult.data;
        error = signInResult.error;
      }
    }
  }

  if (error || !data.user) {
    await admin.from("login_activity_logs").insert({
      login_id: parsed.data.loginId,
      ip_address: meta.ip,
      browser_fingerprint: fingerprint,
      status: "FAILED",
      user_agent: meta.userAgent,
    });
    return fail("아이디 또는 비밀번호가 올바르지 않습니다.", 401, "INVALID_CREDENTIALS");
  }

  const { data: profile } = await admin.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile) return fail("회원 정보가 생성되지 않았습니다.\n관리자에게 문의해 주세요.", 500, "PROFILE_MISSING");

  const { data: modeRow } = await admin.from("site_settings").select("value").eq("key", "operation_mode").maybeSingle();
  const operationMode = String((modeRow as { value?: unknown } | null)?.value ?? "ACTIVE").replace(/^"|"$/g, "");
  const adminRole = isAdminRole(profile.role);

  if ((operationMode === "UPDATING" || operationMode === "READ_ONLY") && !adminRole) {
    await supabase.auth.signOut();
    return fail("현재 업데이트중입니다.\n관리자만 로그인할 수 있습니다.", 503, "OPERATION_LOGIN_BLOCKED");
  }

  if ((operationMode === "INACTIVE" || operationMode === "MAINTENANCE") && profile.role !== "SUPER_ADMIN") {
    await supabase.auth.signOut();
    return fail("현재 사이트가 비활성화되어 최고 관리자만 로그인할 수 있습니다.", 503, "OPERATION_LOGIN_BLOCKED");
  }

  await admin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);
  await admin.from("member_session_status").upsert(
    {
      profile_id: data.user.id,
      status: "ONLINE",
      last_login_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      ip_address: meta.ip,
      browser_fingerprint: fingerprint,
      user_agent: meta.userAgent,
    },
    { onConflict: "profile_id" },
  );

  await admin.from("login_activity_logs").insert({
    profile_id: data.user.id,
    login_id: profile.username ?? parsed.data.loginId,
    ip_address: meta.ip,
    browser_fingerprint: fingerprint,
    status: "SUCCESS",
    user_agent: meta.userAgent,
  });

  if (adminRole) {
    await admin.rpc("append_admin_log", {
      p_admin_id: profile.id,
      p_action: "ADMIN_LOGIN",
      p_target_table: "profiles",
      p_target_id: profile.id,
      p_details: { loginId: profile.username ?? profile.email, role: profile.role },
      p_ip: meta.ip,
      p_user_agent: meta.userAgent,
    });
  }

  if (profile.status === "APPROVED") {
    await trackStepMission({
      admin,
      profileId: data.user.id,
      missionType: "LOGIN",
      amount: 1,
      sourceType: "LOGIN",
      sourceId: data.user.id,
      autoClaim: true,
      details: { loginId: profile.username ?? parsed.data.loginId, ip: meta.ip },
    });
  }

  let redirectTo = "/account";
  if (profile.status === "PENDING") redirectTo = "/pending";
  else if (profile.status !== "APPROVED") {
    await supabase.auth.signOut();
    redirectTo = "/login?error=account_unavailable";
  } else if (profile.must_change_password) redirectTo = "/change-password";
  else if (adminRole) redirectTo = "/admin";
  else if (parsed.data.nextPath?.startsWith("/") && !parsed.data.nextPath.startsWith("//")) redirectTo = parsed.data.nextPath;

  return ok({ redirectTo, profile: { displayName: profile.display_name, role: profile.role, status: profile.status } });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/auth/login", rateLimit: { kind: "login", limit: 10, windowSeconds: 60 } });
