import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { isAdminRole } from "@/lib/admin-capabilities";
import { credentialToAuthEmail, normalizeLoginId } from "@/lib/identity";
import { isTemporaryPassword, mustChangePassword } from "@/lib/password-reset";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { trackStepMission } from "@/lib/step-events";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";
type LoginProfile = {
  id: string;
  email: string | null;
  username?: string | null;
  display_name?: string | null;
  role?: string | null;
  status?: string | null;
  must_change_password?: boolean | null;
  password_changed_at?: string | null;
};

async function resolveCredentialProfile(admin: ReturnType<typeof createAdminClient>, loginId: string) {
  const raw = String(loginId ?? "").trim().toLowerCase();
  const username = normalizeLoginId(raw);
  const authEmail = raw.includes("@") ? raw : credentialToAuthEmail(username || raw);

  let profile: LoginProfile | null = null;

  if (username) {
    const { data } = await admin
      .from("profiles")
      .select("id,email,username,display_name,role,status,must_change_password,password_changed_at")
      .eq("username", username)
      .maybeSingle();
    profile = (data as LoginProfile | null) ?? null;
  }

  if (!profile) {
    const { data } = await admin
      .from("profiles")
      .select("id,email,username,display_name,role,status,must_change_password,password_changed_at")
      .eq("email", authEmail)
      .maybeSingle();
    profile = (data as LoginProfile | null) ?? null;
  }

  const email = String(profile?.email ?? authEmail).trim().toLowerCase();
  return { profile, email: email || authEmail };
}

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
  const { profile: preAuthProfile, email: credential } = await resolveCredentialProfile(admin, parsed.data.loginId);

  await admin.from("login_activity_logs").insert({
    login_id: parsed.data.loginId,
    ip_address: meta.ip,
    browser_fingerprint: fingerprint,
    status: "TRYING",
    user_agent: meta.userAgent,
  });

  const preAuthNeedsPasswordChange = mustChangePassword(preAuthProfile);

  // 복구 모드: 비밀번호가 비어 있는 복구 계정은 로그인 시점에만 공통 임시 비밀번호를 Supabase Auth에 적용한다.
  // 외부 스크립트 없이 GitHub/Vercel 코드만으로 처리하기 위한 안전장치다.
  if (preAuthProfile && preAuthNeedsPasswordChange && isTemporaryPassword(parsed.data.password)) {
    const email = String(preAuthProfile.email ?? credential).trim().toLowerCase();
    const { error: tempPasswordError } = await admin.auth.admin.updateUserById(preAuthProfile.id, {
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { username: preAuthProfile.username ?? undefined, displayName: preAuthProfile.display_name ?? undefined },
    });
    if (tempPasswordError) {
      await admin.from("login_activity_logs").insert({
        login_id: parsed.data.loginId,
        ip_address: meta.ip,
        browser_fingerprint: fingerprint,
        status: "FAILED",
        user_agent: meta.userAgent,
      });
      return fail("복구 계정의 임시 비밀번호를 적용하지 못했습니다. 관리자에게 문의해 주세요.", 500, "TEMP_PASSWORD_APPLY_FAILED", tempPasswordError.message);
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: credential, password: parsed.data.password });

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
  const forcePasswordChange = mustChangePassword(profile);
  if (profile.status === "PENDING") redirectTo = "/pending";
  else if (profile.status !== "APPROVED") {
    await supabase.auth.signOut();
    redirectTo = "/login?error=account_unavailable";
  } else if (forcePasswordChange) redirectTo = "/change-password";
  else if (adminRole) redirectTo = "/admin";
  else if (parsed.data.nextPath?.startsWith("/") && !parsed.data.nextPath.startsWith("//")) redirectTo = parsed.data.nextPath;

  return ok({ redirectTo, profile: { displayName: profile.display_name, role: profile.role, status: profile.status, mustChangePassword: forcePasswordChange } });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/auth/login", rateLimit: { kind: "login", limit: 10, windowSeconds: 60 } });
