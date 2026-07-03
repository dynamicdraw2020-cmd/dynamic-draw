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

type LoginProfile = {
  id: string;
  email: string | null;
  username: string | null;
  display_name?: string | null;
  role: string | null;
  status: string | null;
  must_change_password?: boolean | null;
};

type AuthData = {
  user: { id: string } | null;
  session?: unknown;
};

type AuthError = { message?: string; code?: string; status?: number } | null;

function safeLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function ignoreSideEffect<T>(promise: PromiseLike<T>) {
  try {
    await promise;
  } catch {
    // 로그인은 로그/세션/미션 기록 실패 때문에 막히면 안 된다.
  }
}

async function findProfile(admin: ReturnType<typeof createAdminClient>, loginValue: string, normalizedLoginId: string) {
  if (loginValue.includes("@")) {
    const { data } = await admin
      .from("profiles")
      .select("*")
      .ilike("email", loginValue)
      .maybeSingle();
    return (data ?? null) as LoginProfile | null;
  }

  const { data } = await admin
    .from("profiles")
    .select("*")
    .eq("username", normalizedLoginId)
    .maybeSingle();
  return (data ?? null) as LoginProfile | null;
}

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const meta = requestMeta(request);
  const limited = await enforceRateLimit(`login:v170:${meta.ip}`, 30, 60 * 10);
  if (limited) return limited;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("아이디와 비밀번호를 확인해 주세요.", 422, "VALIDATION_ERROR");

  const supabase = await createClient();
  const admin = createAdminClient();
  const fingerprint = String(parsed.data.browserFingerprint || "unknown").slice(0, 120);
  const loginIdRaw = String(parsed.data.loginId || "").trim();
  const loginValue = safeLower(loginIdRaw);
  const normalizedLoginId = normalizeLoginId(loginValue);
  const password = String(parsed.data.password || "").trim();

  // 핵심 수정: 이메일이면 그대로 Supabase Auth에 넘기고, 아이디일 때만 local 이메일로 변환한다.
  const credential = loginValue.includes("@") ? loginValue : credentialToAuthEmail(loginIdRaw);

  await ignoreSideEffect(
    admin.from("login_activity_logs").insert({
      login_id: loginIdRaw,
      email: loginValue.includes("@") ? loginValue : null,
      ip_address: meta.ip,
      browser_fingerprint: fingerprint,
      status: "TRYING",
      user_agent: meta.userAgent,
    }),
  );

  let signInEmail = credential;
  let authData: AuthData = { user: null };
  let authError: AuthError = null;

  // 최종 복구 로그인:
  // DB에는 비밀번호가 맞는데 Supabase Auth password login이 401을 반환하는 복구 계정은
  // 서버 권한으로 1회용 magic link를 만들고, 서버 클라이언트로 verifyOtp를 호출해 쿠키 세션을 만든다.
  // 일반 사용자는 기존 password login 흐름 그대로 유지한다.
  if (password === TEMP_PASSWORD) {
    try {
      const recoveryProfile = await findProfile(admin, loginValue, normalizedLoginId);

      if (recoveryProfile?.id && recoveryProfile.must_change_password && recoveryProfile.status === "APPROVED") {
        const recoveryEmail = safeLower(recoveryProfile.email || credential);
        signInEmail = recoveryEmail;

        await admin.auth.admin.updateUserById(recoveryProfile.id, {
          email: recoveryEmail,
          password: TEMP_PASSWORD,
          email_confirm: true,
        });

        const linkResult = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: recoveryEmail,
        });

        const tokenHash = linkResult?.data?.properties?.hashed_token;
        if (tokenHash) {
          const verifyResult = await supabase.auth.verifyOtp({
            type: "magiclink",
            email: recoveryEmail,
            token_hash: tokenHash,
          });

          authData = (verifyResult.data ?? { user: null }) as AuthData;
          authError = (verifyResult.error ?? null) as AuthError;
        }
      }
    } catch {
      authData = { user: null };
      authError = { message: "TEMP_PASSWORD_RECOVERY_FAILED", code: "TEMP_PASSWORD_RECOVERY_FAILED", status: 401 };
    }
  }

  if (!authData.user) {
    const firstResult = await supabase.auth.signInWithPassword({ email: signInEmail, password });
    authData = (firstResult.data ?? { user: null }) as AuthData;
    authError = (firstResult.error ?? null) as AuthError;
  }

  if (authError || !authData.user) {
    await ignoreSideEffect(
      admin.from("login_activity_logs").insert({
        login_id: loginIdRaw,
        email: signInEmail,
        ip_address: meta.ip,
        browser_fingerprint: fingerprint,
        status: "FAILED",
        user_agent: meta.userAgent,
      }),
    );
    return fail("아이디 또는 비밀번호가 올바르지 않습니다.", 401, "INVALID_CREDENTIALS");
  }

  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();

  const profile = profileRow as LoginProfile | null;
  if (profileError || !profile) return fail("회원 정보가 생성되지 않았습니다. 관리자에게 문의해 주세요.", 500, "PROFILE_MISSING");

  let operationMode = "ACTIVE";
  try {
    const { data: modeRow } = await admin.from("site_settings").select("value").eq("key", "operation_mode").maybeSingle();
    operationMode = String((modeRow as { value?: unknown } | null)?.value ?? "ACTIVE").replace(/^"|"$/g, "");
  } catch {
    operationMode = "ACTIVE";
  }

  const adminRole = isAdminRole(profile.role);

  if ((operationMode === "UPDATING" || operationMode === "READ_ONLY") && !adminRole) {
    await supabase.auth.signOut();
    return fail("현재 업데이트중입니다. 관리자만 로그인할 수 있습니다.", 503, "OPERATION_LOGIN_BLOCKED");
  }

  if ((operationMode === "INACTIVE" || operationMode === "MAINTENANCE") && profile.role !== "SUPER_ADMIN") {
    await supabase.auth.signOut();
    return fail("현재 사이트가 비활성화되어 최고 관리자만 로그인할 수 있습니다.", 503, "OPERATION_LOGIN_BLOCKED");
  }

  const now = new Date().toISOString();

  await ignoreSideEffect(admin.from("profiles").update({ last_login_at: now }).eq("id", authData.user.id));

  await ignoreSideEffect(
    admin.from("member_session_status").upsert(
      {
        profile_id: authData.user.id,
        status: "ONLINE",
        is_online: true,
        last_login_at: now,
        last_seen_at: now,
        ip_address: meta.ip,
        browser_fingerprint: fingerprint,
        user_agent: meta.userAgent,
        updated_at: now,
      },
      { onConflict: "profile_id" },
    ),
  );

  await ignoreSideEffect(
    admin.from("login_activity_logs").insert({
      profile_id: authData.user.id,
      login_id: profile.username ?? loginIdRaw,
      email: profile.email ?? signInEmail,
      username: profile.username ?? null,
      success: true,
      ip_address: meta.ip,
      browser_fingerprint: fingerprint,
      status: "SUCCESS",
      user_agent: meta.userAgent,
    }),
  );

  if (adminRole) {
    await ignoreSideEffect(
      admin.rpc("append_admin_log", {
        p_admin_id: profile.id,
        p_action: "ADMIN_LOGIN",
        p_target_table: "profiles",
        p_target_id: profile.id,
        p_details: { loginId: profile.username ?? profile.email, role: profile.role },
        p_ip: meta.ip,
        p_user_agent: meta.userAgent,
      }),
    );
  }

  if (profile.status === "APPROVED") {
    await ignoreSideEffect(
      trackStepMission({
        admin,
        profileId: authData.user.id,
        missionType: "LOGIN",
        amount: 1,
        sourceType: "LOGIN",
        sourceId: authData.user.id,
        autoClaim: true,
        details: { loginId: profile.username ?? loginIdRaw, ip: meta.ip },
      }),
    );
  }

  let redirectTo = "/account";
  if (profile.status === "PENDING") redirectTo = "/pending";
  else if (profile.status !== "APPROVED") {
    await supabase.auth.signOut();
    redirectTo = "/login?error=account_unavailable";
  } else if (profile.must_change_password) redirectTo = "/reset-password";
  else if (adminRole) redirectTo = "/admin";
  else if (parsed.data.nextPath?.startsWith("/") && !parsed.data.nextPath.startsWith("//")) redirectTo = parsed.data.nextPath;

  return ok({ redirectTo, profile: { displayName: profile.display_name, role: profile.role, status: profile.status } });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/auth/login", rateLimit: { kind: "login", limit: 30, windowSeconds: 60 } });
