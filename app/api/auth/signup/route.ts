import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { loginIdToAuthEmail, validateLoginId } from "@/lib/identity";
import { ensureReferralCode, nextNumericReferralCode, normalizeReferralCodeInput } from "@/lib/reward-engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";
const schema = z.object({
  loginId: z.string().trim().min(1, "아이디를 입력해 주세요."),
  displayName: z.string().trim().min(2, "이름 또는 닉네임은 2자 이상 입력해 주세요.").max(30),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72),
  referralCode: z.string().trim().max(8, "추천인 ID는 8자리 이내 숫자만 입력해 주세요.").optional().default(""),
  secretCode: z.string().trim().min(6, "관리자에게 받은 시크릿코드를 입력해 주세요.").max(40),
  browserFingerprint: z.string().trim().max(120).optional().default(""),
  website: z.string().trim().max(200).optional().default(""),
  signupStartedAt: z.string().trim().max(30).optional().default(""),
});

type AdminClient = ReturnType<typeof createAdminClient>;

function settledCount(result: PromiseSettledResult<{ count?: number | null }>) {
  return result.status === "fulfilled" ? Number(result.value.count ?? 0) : 0;
}
type AuthAdminError = { code?: string; message?: string; status?: number } | null;
type SecretValidation = { valid?: boolean; reason?: string; expiresAt?: string; codeLabel?: string } | null;
type SignupGuardRelease = {
  allowed?: boolean;
  releaseId?: string;
  kind?: string;
  value?: string;
  usesRemaining?: number;
  expiresAt?: string;
} | null;

function looksAutomatedSignup(loginId: string, displayName: string) {
  const id = loginId.toLowerCase();
  const name = displayName.toLowerCase();
  const patterns = [/^user\d+[_-][a-z0-9]{4,}$/i, /^u_mr0[a-z0-9_]{5,}$/i, /^user_?[a-z0-9]{8,}$/i, /^test[_-]?bot/i];
  const displayPatterns = [/^user\d+[_-][a-z0-9]{4,}$/i, /^user_?[a-z0-9]{8,}$/i];
  return patterns.some((pattern) => pattern.test(id)) || displayPatterns.some((pattern) => pattern.test(name));
}

function signupElapsedMs(value: string) {
  const started = Number(value);
  if (!Number.isFinite(started) || started <= 0) return null;
  const elapsed = Date.now() - started;
  return Number.isFinite(elapsed) ? elapsed : null;
}

async function logSecurityEvent(admin: AdminClient, payload: Record<string, unknown>) {
  try {
    await admin.from("security_events").insert({
      event_type: payload.eventType ?? "SIGNUP_GUARD",
      severity: payload.severity ?? "MEDIUM",
      ip_address: payload.ip ?? "unknown",
      browser_fingerprint: payload.browserFingerprint ?? "unknown",
      login_id: payload.loginId ?? null,
      display_name: payload.displayName ?? null,
      reason: payload.reason ?? "security guard",
      details: payload,
    });
  } catch {
    // security_events 테이블 적용 전에도 회원가입 로직은 계속 동작합니다.
  }
}

async function temporaryBlock(admin: AdminClient, kind: string, value: string, reason: string, minutes = 30) {
  if (!value || value === "unknown") return;
  try {
    await admin.from("security_blocklist").insert({
      kind,
      value,
      reason,
      expires_at: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
      is_active: true,
    });
  } catch {
    // 중복 또는 테이블 미적용 시 무시합니다.
  }
}

async function consumeSignupGuardRelease(
  admin: AdminClient,
  payload: { loginId: string; ip: string; browserFingerprint: string; reason: string },
): Promise<SignupGuardRelease> {
  try {
    const { data, error } = await admin.rpc("consume_signup_guard_release", {
      p_login_id: payload.loginId.toLowerCase(),
      p_ip: payload.ip,
      p_browser_fingerprint: payload.browserFingerprint,
      p_reason: payload.reason,
    });

    if (error) return null;
    return (data ?? null) as SignupGuardRelease;
  } catch {
    // v1.6.8 SQL 적용 전에는 기존 방어 로직 그대로 동작합니다.
    return null;
  }
}

function signupError(error: AuthAdminError) {
  const text = String(error?.message ?? "").toLowerCase();
  const technicalCode = error?.code ?? error?.status;

  if (text.includes("already") || text.includes("registered") || text.includes("exists")) {
    return fail("이미 사용 중인 아이디입니다.\n다른 아이디를 사용해 주세요.", 409, "LOGIN_ID_ALREADY_REGISTERED", technicalCode);
  }

  if (text.includes("rate limit") || text.includes("too many")) {
    return fail("회원가입 요청이 잠시 제한되었습니다. 몇 분 뒤 다시 시도해 주세요.", 429, "AUTH_RATE_LIMITED", technicalCode);
  }

  if (text.includes("signup") && text.includes("disabled")) {
    return fail("Supabase에서 신규 회원가입이 꺼져 있습니다. 관리자에게 문의해 주세요.", 503, "SIGNUP_DISABLED", technicalCode);
  }

  if (text.includes("password")) {
    return fail("비밀번호 조건을 충족하지 못했습니다.\n8자 이상으로 다시 입력해 주세요.", 422, "PASSWORD_REJECTED", technicalCode);
  }

  if (text.includes("database") || text.includes("saving new user")) {
    return fail("회원 DB를 만드는 중 오류가 발생했습니다. 관리자에게 DB 보정 SQL 확인을 요청해 주세요.", 503, "PROFILE_CREATE_TRIGGER_FAILED", technicalCode);
  }

  return fail("가입 신청을 처리하지 못했습니다.\n잠시 후 다시 시도해 주세요.", 400, "SIGNUP_FAILED", technicalCode);
}

function secretValidationMessage(result: SecretValidation) {
  if (!result?.valid) {
    if (result?.reason === "USED") return "이미 사용된 시크릿코드입니다. 코드는 1회만 사용할 수 있습니다.";
    if (result?.reason === "EXPIRED") return "만료된 시크릿코드입니다. 코드는 발급 후 4시간만 유효합니다.";
    if (result?.reason === "REVOKED") return "회수된 시크릿코드입니다. CS에게 새 코드를 요청해 주세요.";
    return "시크릿코드가 올바르지 않습니다.";
  }
  return "";
}

async function cleanupFailedSignup(admin: AdminClient, profileId: string) {
  try {
    await admin.from("profiles").delete().eq("id", profileId);
  } catch {}

  try {
    await admin.auth.admin.deleteUser(profileId);
  } catch {}
}

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());
  }

  const login = validateLoginId(parsed.data.loginId);
  if (!login.ok) return fail(login.message, 422, "LOGIN_ID_INVALID");

  const { ip, userAgent } = requestMeta(request);
  const admin = createAdminClient();
  const fingerprint = String(parsed.data.browserFingerprint || "unknown").slice(0, 120);
  let riskScore = 0;
  const riskFlags: string[] = [];

  let signupBypassBySuperAdmin = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: adminProfile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      signupBypassBySuperAdmin = adminProfile?.role === "SUPER_ADMIN";
    }
  } catch {}

  let signupGuardRelease: SignupGuardRelease = null;

  async function allowOneReleasedSignupAttempt(reason: string) {
    if (signupBypassBySuperAdmin) return true;
    if (signupGuardRelease?.allowed) return true;

    const release = await consumeSignupGuardRelease(admin, {
      loginId: login.loginId,
      ip,
      browserFingerprint: fingerprint,
      reason,
    });

    if (!release?.allowed) return false;
    signupGuardRelease = release;
    riskFlags.push(`최고관리자 1회 해제권 사용: ${reason}`);
    await logSecurityEvent(admin, {
      eventType: "SIGNUP_GUARD_RELEASE_CONSUMED",
      severity: "LOW",
      ip,
      browserFingerprint: fingerprint,
      loginId: login.loginId,
      displayName: parsed.data.displayName,
      reason,
      release,
    });
    return true;
  }

  const limited = await enforceRateLimit(`signup:v168:${ip}`, 8, 60 * 10);
  if (limited && !(await allowOneReleasedSignupAttempt("RATE_LIMIT"))) return limited;

  const { data: secretStatus, error: secretStatusError } = await admin.rpc("validate_signup_secret_code", {
    p_code: parsed.data.secretCode,
  });

  if (secretStatusError) {
    return fail(
      "가입 시크릿코드 검증 기능이 DB에 아직 적용되지 않았습니다.\n관리자에게 v1.6.1 이상 SQL 적용 여부를 확인해 주세요.",
      503,
      "SIGNUP_SECRET_SQL_REQUIRED",
      secretStatusError.message,
    );
  }

  const secretValidation = secretStatus as SecretValidation;
  if (!secretValidation?.valid) {
    return fail(secretValidationMessage(secretValidation), 403, "SIGNUP_SECRET_INVALID", secretValidation?.reason);
  }

  const elapsed = signupElapsedMs(parsed.data.signupStartedAt);

  if (!signupBypassBySuperAdmin && parsed.data.website.trim() && !(await allowOneReleasedSignupAttempt("HONEYPOT_BLOCK"))) {
    await logSecurityEvent(admin, {
      eventType: "SIGNUP_HONEYPOT_BLOCK",
      severity: "HIGH",
      ip,
      browserFingerprint: fingerprint,
      loginId: login.loginId,
      displayName: parsed.data.displayName,
      reason: "honeypot field filled",
    });
    await temporaryBlock(admin, "IP", ip, "자동 가입 방어: honeypot 입력", 60);
    return fail("자동 가입으로 의심되어 가입 신청이 차단되었습니다.", 429, "SIGNUP_BOT_BLOCKED");
  }

  if (!signupBypassBySuperAdmin && elapsed !== null && elapsed < 2500 && !(await allowOneReleasedSignupAttempt("TOO_FAST_BLOCK"))) {
    await logSecurityEvent(admin, {
      eventType: "SIGNUP_TOO_FAST_BLOCK",
      severity: "HIGH",
      ip,
      browserFingerprint: fingerprint,
      loginId: login.loginId,
      displayName: parsed.data.displayName,
      elapsedMs: elapsed,
      reason: "form submitted too quickly",
    });
    await temporaryBlock(admin, "FINGERPRINT", fingerprint, "자동 가입 방어: 비정상적으로 빠른 제출", 30);
    return fail("가입 신청 속도가 비정상적으로 빠릅니다.\n3분 뒤에 다시 시도해 주세요.", 429, "SIGNUP_TOO_FAST");
  }

  if (!signupBypassBySuperAdmin && looksAutomatedSignup(login.loginId, parsed.data.displayName) && !(await allowOneReleasedSignupAttempt("PATTERN_BLOCK"))) {
    await logSecurityEvent(admin, {
      eventType: "SIGNUP_PATTERN_BLOCK",
      severity: "HIGH",
      ip,
      browserFingerprint: fingerprint,
      loginId: login.loginId,
      displayName: parsed.data.displayName,
      reason: "automated login/display pattern",
    });
    await temporaryBlock(admin, "IP", ip, "자동 가입 방어: 봇 계정명 패턴", 60);
    return fail("자동 생성 계정으로 의심되어 가입 신청이 차단되었습니다.", 429, "SIGNUP_PATTERN_BLOCKED");
  }

  try {
    const { data: blockedRows } = await admin
      .from("security_blocklist")
      .select("id,kind,value,reason,expires_at")
      .eq("is_active", true)
      .in("kind", ["IP", "FINGERPRINT", "LOGIN_ID"])
      .in("value", [ip, fingerprint, login.loginId.toLowerCase()])
      .limit(20);

    const now = Date.now();
    const blocked = ((blockedRows ?? []) as Array<{ reason?: string | null; expires_at?: string | null }>).find(
      (row) => !row.expires_at || new Date(row.expires_at).getTime() > now,
    );

    if (!signupBypassBySuperAdmin && blocked && !(await allowOneReleasedSignupAttempt("BLOCKLIST_HIT"))) {
      await logSecurityEvent(admin, {
        eventType: "SIGNUP_BLOCKLIST_HIT",
        severity: "HIGH",
        ip,
        browserFingerprint: fingerprint,
        loginId: login.loginId,
        displayName: parsed.data.displayName,
        reason: blocked.reason ?? "blocklist hit",
      });
      return fail("현재 가입 신청이 잠시 제한되었습니다.\n잠시 후 다시 시도해 주세요.", 429, "SIGNUP_BLOCKLISTED");
    }
  } catch {
    // 보안 테이블 적용 전 호환
  }

  try {
    const cooldownSince = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const [recentDeviceResult, recentIpResult] = await Promise.allSettled([
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("browser_fingerprint", fingerprint).gte("created_at", cooldownSince),
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("ip_address", ip).gte("created_at", cooldownSince),
    ]);
    const recentDeviceCount = settledCount(recentDeviceResult);
    const recentIpCount = settledCount(recentIpResult);

    if (!signupBypassBySuperAdmin && ((fingerprint !== "unknown" && recentDeviceCount > 0) || recentIpCount > 0) && !(await allowOneReleasedSignupAttempt("DEVICE_COOLDOWN"))) {
      return fail("이미 회원가입을 요청하였습니다.\n3분 뒤에 재시도 해주세요.", 429, "SIGNUP_DEVICE_COOLDOWN");
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [sameIpResult, sameFingerprintResult] = await Promise.allSettled([
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("ip_address", ip).gte("created_at", since),
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("browser_fingerprint", fingerprint).gte("created_at", since),
    ]);
    const sameIpCount = settledCount(sameIpResult);
    const sameFingerprintCount = settledCount(sameFingerprintResult);

    if (sameIpCount >= 2) {
      riskScore += 35;
      riskFlags.push("동일 IP 24시간 내 다중 가입");
    }
    if (fingerprint !== "unknown" && sameFingerprintCount >= 1) {
      riskScore += 45;
      riskFlags.push("동일 브라우저 지문 재가입 의심");
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const [tenMinuteIpResult, tenMinuteFpResult] = await Promise.allSettled([
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("ip_address", ip).gte("created_at", tenMinutesAgo),
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("browser_fingerprint", fingerprint).gte("created_at", tenMinutesAgo),
    ]);
    const tenMinuteIpCount = settledCount(tenMinuteIpResult);
    const tenMinuteFpCount = settledCount(tenMinuteFpResult);

    if (!signupBypassBySuperAdmin && tenMinuteIpCount >= 3 && !(await allowOneReleasedSignupAttempt("IP_BURST_BLOCK"))) {
      await logSecurityEvent(admin, {
        eventType: "SIGNUP_IP_BURST_BLOCK",
        severity: "CRITICAL",
        ip,
        browserFingerprint: fingerprint,
        loginId: login.loginId,
        displayName: parsed.data.displayName,
        count: tenMinuteIpCount,
        reason: "too many signups from same IP",
      });
      await temporaryBlock(admin, "IP", ip, "10분 내 가입 신청 과다", 60);
      return fail("같은 네트워크에서 가입 신청이 너무 많습니다.\n1시간 뒤에 다시 시도해 주세요.", 429, "SIGNUP_IP_BURST_BLOCKED");
    }

    if (!signupBypassBySuperAdmin && fingerprint !== "unknown" && tenMinuteFpCount >= 1 && !(await allowOneReleasedSignupAttempt("DEVICE_REPEAT_BLOCK"))) {
      await logSecurityEvent(admin, {
        eventType: "SIGNUP_DEVICE_REPEAT_BLOCK",
        severity: "HIGH",
        ip,
        browserFingerprint: fingerprint,
        loginId: login.loginId,
        displayName: parsed.data.displayName,
        count: tenMinuteFpCount,
        reason: "same device repeated signup",
      });
      await temporaryBlock(admin, "FINGERPRINT", fingerprint, "동일 기기 반복 가입 신청", 180);
      return fail("이미 이 기기에서 가입 신청을 요청했습니다.\n잠시 후 다시 시도해 주세요.", 429, "SIGNUP_DEVICE_REPEAT_BLOCKED");
    }
  } catch {
    // 중복가입 위험도 테이블이 아직 적용되지 않은 기존 설치와의 호환을 위해 무시합니다.
  }

  if (!signupBypassBySuperAdmin && riskScore >= 70 && !(await allowOneReleasedSignupAttempt("RISK_SCORE_BLOCK"))) {
    await logSecurityEvent(admin, {
      eventType: "SIGNUP_RISK_BLOCK",
      severity: "HIGH",
      ip,
      browserFingerprint: fingerprint,
      loginId: login.loginId,
      displayName: parsed.data.displayName,
      riskScore,
      riskFlags,
      reason: "risk score threshold exceeded",
    });
    await temporaryBlock(admin, "IP", ip, "가입 위험도 초과", 60);
    return fail("중복 가입 또는 자동 가입으로 의심되어 가입 신청이 차단되었습니다.", 429, "SIGNUP_RISK_BLOCKED");
  }

  const authEmail = loginIdToAuthEmail(login.loginId);
  const { data: existing } = await admin.from("profiles").select("id").eq("username", login.loginId).maybeSingle();
  if (existing) return fail("이미 사용 중인 아이디입니다.\n다른 아이디를 사용해 주세요.", 409, "LOGIN_ID_ALREADY_REGISTERED");

  let referredBy: string | null = null;
  const rawReferral = parsed.data.referralCode.trim();
  if (rawReferral && !/^[0-9]{1,8}$/.test(rawReferral)) {
    return fail("추천인 ID는 8자리 이내 숫자만 입력해 주세요.", 422, "REFERRAL_CODE_INVALID");
  }

  const normalizedReferral = normalizeReferralCodeInput(rawReferral);
  if (normalizedReferral) {
    let referrer: { id: string; username?: string | null; referral_code?: string | null; status?: string | null } | null = null;

    try {
      const { data: stableRef } = await admin.from("profile_referral_codes").select("profile_id,referral_code").eq("referral_code", normalizedReferral).maybeSingle();
      if (stableRef?.profile_id) {
        const { data: profileRow } = await admin
          .from("profiles")
          .select("id,username,referral_code,status")
          .eq("id", stableRef.profile_id)
          .eq("status", "APPROVED")
          .maybeSingle();
        referrer = profileRow;
      }
    } catch {
      // 안정 추천 ID 테이블 적용 전 호환: profiles.referral_code로 조회합니다.
    }

    if (!referrer) {
      const { data: profileReferrer } = await admin
        .from("profiles")
        .select("id,username,referral_code,status")
        .eq("referral_code", normalizedReferral)
        .eq("status", "APPROVED")
        .maybeSingle();
      referrer = profileReferrer;
    }

    if (!referrer) return fail("추천인 ID를 찾을 수 없습니다.\n추천인에게 숫자 추천 ID를 다시 확인해 주세요.", 404, "REFERRER_NOT_FOUND");
    if (referrer.username === login.loginId) return fail("자기 자신은 추천인으로 입력할 수 없습니다.", 409, "SELF_REFERRAL_BLOCKED");
    referredBy = referrer.id;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      display_name: parsed.data.displayName,
      username: login.loginId,
      signup_secret_verified: true,
      signup_guard_release_id: signupGuardRelease?.releaseId ?? null,
    },
  });

  if (createError || !created.user) return signupError(createError);

  const ownReferralCode = await nextNumericReferralCode(admin, created.user.id);
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: created.user.id,
      email: authEmail,
      username: login.loginId,
      display_name: parsed.data.displayName,
      phone: null,
      role: "USER",
      status: "PENDING",
      member_code: null,
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
      referral_code: ownReferralCode,
      referred_by: referredBy,
      browser_fingerprint: fingerprint,
      ip_address: ip,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    await cleanupFailedSignup(admin, created.user.id);
    const duplicate = profileError.message.toLowerCase().includes("duplicate");
    return fail(
      duplicate ? "이미 사용 중인 아이디입니다.\n다른 아이디를 사용해 주세요." : "회원 정보 저장에 실패했습니다.\n관리자에게 DB 권한 보정 SQL 확인을 요청해 주세요.",
      duplicate ? 409 : 503,
      duplicate ? "LOGIN_ID_ALREADY_REGISTERED" : "PROFILE_CREATE_FAILED",
      profileError.code,
    );
  }

  const { error: consumeError } = await admin.rpc("consume_signup_secret_code", {
    p_code: parsed.data.secretCode,
    p_profile_id: created.user.id,
    p_login_id: login.loginId,
    p_ip: ip,
    p_user_agent: userAgent,
    p_browser_fingerprint: fingerprint,
  });

  if (consumeError) {
    await cleanupFailedSignup(admin, created.user.id);
    return fail(consumeError.message || "시크릿코드가 유효하지 않습니다.", 403, "SIGNUP_SECRET_INVALID", consumeError.code);
  }

  await ensureReferralCode(admin, { id: created.user.id, referral_code: ownReferralCode });

  if (referredBy) {
    await admin.from("referral_logs").insert({
      referrer_id: referredBy,
      referred_profile_id: created.user.id,
      referral_code: normalizedReferral,
      status: "PENDING",
    });
  }

  try {
    await admin.from("signup_risk_assessments").insert({
      profile_id: created.user.id,
      login_id: login.loginId,
      ip_address: ip,
      browser_fingerprint: fingerprint,
      risk_score: riskScore,
      risk_flags: riskFlags,
      user_agent: userAgent,
    });
  } catch {
    // 보정 SQL 적용 전 호환
  }

  return ok(
    {
      userId: created.user.id,
      redirectTo: "/login",
      message: "가입 신청이 완료되었습니다.\n관리자가 승인하면 같은 아이디와 비밀번호로 로그인할 수 있습니다.",
    },
    201,
  );
}

export const POST = withApiRoute(postHandler, { routeName: "/api/auth/signup", rateLimit: { kind: "api", limit: 60, windowSeconds: 60 } });
