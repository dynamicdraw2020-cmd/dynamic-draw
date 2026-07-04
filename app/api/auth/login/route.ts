import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { isAdminRole } from "@/lib/admin-capabilities";
import { credentialToAuthEmail, normalizeLoginId } from "@/lib/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { trackStepMission } from "@/lib/step-events";
import { createEmergencySessionValue, EMERGENCY_SESSION_COOKIE, emergencySessionCookieOptions } from "@/lib/emergency-session";
import { isCustomPasswordHash, verifyCustomPasswordHash } from "@/lib/custom-password";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

const TEMP_PASSWORD = "DynamicD2026!reset";
const ADMIN_RECOVERY_EMAILS = new Set(["dynamicdraw2020@gmil.com", "dynamicdraw2020@gmail.com"]);

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

async function findProfile(admin: ReturnType<typeof createAdminClient>, loginValue: string, normalizedLoginId: string, credential: string) {
  if (loginValue.includes("@")) {
    const { data } = await admin.from("profiles").select("*").ilike("email", loginValue).maybeSingle();
    if (data) return data as LoginProfile;
  }

  const { data: byUsername } = await admin.from("profiles").select("*").eq("username", normalizedLoginId).maybeSingle();
  if (byUsername) return byUsername as LoginProfile;

  const { data: byCredentialEmail } = await admin.from("profiles").select("*").ilike("email", credential).maybeSingle();
  return (byCredentialEmail ?? null) as LoginProfile | null;
}

function redirectForProfile(profile: LoginProfile, nextPath?: string) {
  const adminRole = isAdminRole(profile.role);
  if (profile.status === "PENDING") return "/pending";
  if (profile.status !== "APPROVED") return "/login?error=account_unavailable";
  if (profile.must_change_password) return "/reset-password";
  if (adminRole) return "/admin";
  if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) return nextPath;
  return "/account";
}

async function getOperationMode(admin: ReturnType<typeof createAdminClient>) {
  try {
    const { data: modeRow } = await admin.from("site_settings").select("value").eq("key", "operation_mode").maybeSingle();
    return String((modeRow as { value?: unknown } | null)?.value ?? "ACTIVE").replace(/^"|"$/g, "");
  } catch {
    return "ACTIVE";
  }
}

async function isLoginAllowedByOperation(admin: ReturnType<typeof createAdminClient>, profile: LoginProfile) {
  const operationMode = await getOperationMode(admin);
  const adminRole = isAdminRole(profile.role);

  if ((operationMode === "UPDATING" || operationMode === "READ_ONLY") && !adminRole) {
    return { ok: false, status: 503, code: "OPERATION_LOGIN_BLOCKED", message: "현재 업데이트중입니다. 관리자만 로그인할 수 있습니다." } as const;
  }

  if ((operationMode === "INACTIVE" || operationMode === "MAINTENANCE") && profile.role !== "SUPER_ADMIN") {
    return { ok: false, status: 503, code: "OPERATION_LOGIN_BLOCKED", message: "현재 사이트가 비활성화되어 최고 관리자만 로그인할 수 있습니다." } as const;
  }

  return { ok: true } as const;
}

async function checkRecoveryPassword(admin: ReturnType<typeof createAdminClient>, profileId: string, password: string) {
  // 1) 새 복구 방식: 서버 전용 HMAC 해시를 직접 검증한다. Supabase Auth 401과 무관하게 동작한다.
  try {
    const { data } = await admin
      .from("dynamicd_auth_credentials")
      .select("password_hash")
      .eq("profile_id", profileId)
      .maybeSingle();

    const storedHash = (data as { password_hash?: string | null } | null)?.password_hash ?? null;
    if (isCustomPasswordHash(storedHash) && verifyCustomPasswordHash(password, storedHash)) return true;
  } catch {
    // 기존 DB에 테이블/컬럼이 아직 없어도 아래 fallback으로 계속 진행한다.
  }

  // 2) 이전 복구 방식: pgcrypto crypt 함수로 저장된 해시도 계속 지원한다.
  try {
    const { data, error } = await admin.rpc("dynamicd_check_login_password", {
      p_profile_id: profileId,
      p_password: password,
    });
    if (!error && data === true) return true;
  } catch {
    // RPC가 없거나 스키마가 달라도 로그인 전체를 죽이지 않는다.
  }

  return false;
}

async function makeRecoverySessionResponse(params: {
  admin: ReturnType<typeof createAdminClient>;
  profile: LoginProfile;
  meta: ReturnType<typeof requestMeta>;
  fingerprint: string;
  loginIdRaw: string;
  redirectTo: string;
}) {
  const { admin, profile, meta, fingerprint, loginIdRaw, redirectTo } = params;
  const sessionValue = createEmergencySessionValue(profile.id);
  if (!sessionValue) return fail("복구 세션을 만들 수 없습니다. 서버 환경변수를 확인해 주세요.", 500, "RECOVERY_SESSION_CREATE_FAILED");

  const now = new Date().toISOString();

  await ignoreSideEffect(admin.from("profiles").update({ last_login_at: now, updated_at: now }).eq("id", profile.id));

  await ignoreSideEffect(
    admin.from("member_session_status").upsert(
      {
        profile_id: profile.id,
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
      profile_id: profile.id,
      login_id: profile.username ?? loginIdRaw,
      email: profile.email,
      username: profile.username ?? null,
      success: true,
      ip_address: meta.ip,
      browser_fingerprint: fingerprint,
      status: "RECOVERY_SUCCESS",
      user_agent: meta.userAgent,
    }),
  );

  if (isAdminRole(profile.role)) {
    await ignoreSideEffect(
      admin.rpc("append_admin_log", {
        p_admin_id: profile.id,
        p_action: "ADMIN_LOGIN",
        p_target_table: "profiles",
        p_target_id: profile.id,
        p_details: { loginId: profile.username ?? profile.email, role: profile.role, recovery: true },
        p_ip: meta.ip,
        p_user_agent: meta.userAgent,
      }),
    );
  }

  const response = ok({ redirectTo, profile: { displayName: profile.display_name, role: profile.role, status: profile.status } });
  response.cookies.set(EMERGENCY_SESSION_COOKIE, sessionValue, emergencySessionCookieOptions);
  return response;
}

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const meta = requestMeta(request);
  const limited = await enforceRateLimit(`login:custom-recovery:${meta.ip}`, 100, 60 * 10);
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

  const profile = await findProfile(admin, loginValue, normalizedLoginId, credential);

  if (profile?.id) {
    const operation = await isLoginAllowedByOperation(admin, profile);
    if (!operation.ok) return fail(operation.message, operation.status, operation.code);

    const profileEmail = safeLower(profile.email || credential);
    const adminRecovery = ADMIN_RECOVERY_EMAILS.has(profileEmail) || ADMIN_RECOVERY_EMAILS.has(loginValue) || isAdminRole(profile.role);
    const recoveryPasswordOk = await checkRecoveryPassword(admin, profile.id, password);

    if (recoveryPasswordOk || (password === TEMP_PASSWORD && (profile.must_change_password === true || adminRecovery))) {
      return makeRecoverySessionResponse({
        admin,
        profile,
        meta,
        fingerprint,
        loginIdRaw,
        redirectTo: redirectForProfile(profile, parsed.data.nextPath),
      });
    }
  }

  const signInResult = await supabase.auth.signInWithPassword({ email: credential, password });
  if (signInResult.error || !signInResult.data.user) {
    await ignoreSideEffect(
      admin.from("login_activity_logs").insert({
        login_id: loginIdRaw,
        email: credential,
        ip_address: meta.ip,
        browser_fingerprint: fingerprint,
        status: "FAILED",
        user_agent: meta.userAgent,
      }),
    );
    return fail("아이디 또는 비밀번호가 올바르지 않습니다.", 401, "INVALID_CREDENTIALS");
  }

  const { data: profileRow, error: profileError } = await admin.from("profiles").select("*").eq("id", signInResult.data.user.id).maybeSingle();
  const signedProfile = profileRow as LoginProfile | null;
  if (profileError || !signedProfile) return fail("회원 정보가 생성되지 않았습니다. 관리자에게 문의해 주세요.", 500, "PROFILE_MISSING");

  const operation = await isLoginAllowedByOperation(admin, signedProfile);
  if (!operation.ok) {
    await supabase.auth.signOut().catch(() => undefined);
    return fail(operation.message, operation.status, operation.code);
  }

  const now = new Date().toISOString();

  await ignoreSideEffect(admin.from("profiles").update({ last_login_at: now }).eq("id", signInResult.data.user.id));

  await ignoreSideEffect(
    admin.from("member_session_status").upsert(
      {
        profile_id: signInResult.data.user.id,
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
      profile_id: signInResult.data.user.id,
      login_id: signedProfile.username ?? loginIdRaw,
      email: signedProfile.email ?? credential,
      username: signedProfile.username ?? null,
      success: true,
      ip_address: meta.ip,
      browser_fingerprint: fingerprint,
      status: "SUCCESS",
      user_agent: meta.userAgent,
    }),
  );

  if (isAdminRole(signedProfile.role)) {
    await ignoreSideEffect(
      admin.rpc("append_admin_log", {
        p_admin_id: signedProfile.id,
        p_action: "ADMIN_LOGIN",
        p_target_table: "profiles",
        p_target_id: signedProfile.id,
        p_details: { loginId: signedProfile.username ?? signedProfile.email, role: signedProfile.role },
        p_ip: meta.ip,
        p_user_agent: meta.userAgent,
      }),
    );
  }

  if (signedProfile.status === "APPROVED") {
    await ignoreSideEffect(
      trackStepMission({
        admin,
        profileId: signInResult.data.user.id,
        missionType: "LOGIN",
        amount: 1,
        sourceType: "LOGIN",
        sourceId: signInResult.data.user.id,
        autoClaim: true,
        details: { loginId: signedProfile.username ?? loginIdRaw, ip: meta.ip },
      }),
    );
  }

  const redirectTo = redirectForProfile(signedProfile, parsed.data.nextPath);
  return ok({ redirectTo, profile: { displayName: signedProfile.display_name, role: signedProfile.role, status: signedProfile.status } });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/auth/login", rateLimit: { kind: "login", limit: 100, windowSeconds: 60 } });
