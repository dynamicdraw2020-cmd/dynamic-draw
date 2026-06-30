import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta } from "@/lib/api";
import { loginIdToAuthEmail, validateLoginId } from "@/lib/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getStableReferralCode, nextNumericReferralCode, normalizeReferralCodeInput } from "@/lib/reward-engine";

const schema = z.object({
  loginId: z.string().trim().min(1, "아이디를 입력해 주세요."),
  displayName: z.string().trim().min(2, "이름 또는 닉네임은 2자 이상 입력해 주세요.").max(30),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72),
  referralCode: z.string().trim().max(8, "추천인 ID는 8자리 이내 숫자만 입력해 주세요.").optional().default(""),
  browserFingerprint: z.string().trim().max(120).optional().default(""),
  website: z.string().trim().max(200).optional().default(""),
  signupStartedAt: z.string().trim().max(30).optional().default(""),
});

type AuthAdminError = { code?: string; message?: string; status?: number };

function looksAutomatedSignup(loginId: string, displayName: string) {
  const id = loginId.toLowerCase();
  const name = displayName.toLowerCase();
  const patterns = [
    /^user\d+[_-][a-z0-9]{4,}$/i,
    /^u_mr0[a-z0-9_]{5,}$/i,
    /^user_?[a-z0-9]{8,}$/i,
    /^test[_-]?bot/i,
  ];
  const displayPatterns = [
    /^user\d+[_-][a-z0-9]{4,}$/i,
    /^user_?[a-z0-9]{8,}$/i,
  ];
  return patterns.some((pattern) => pattern.test(id)) || displayPatterns.some((pattern) => pattern.test(name));
}

function signupElapsedMs(value: string) {
  const started = Number(value);
  if (!Number.isFinite(started) || started <= 0) return null;
  const elapsed = Date.now() - started;
  return Number.isFinite(elapsed) ? elapsed : null;
}

async function logSecurityEvent(admin: ReturnType<typeof createAdminClient>, payload: Record<string, unknown>) {
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
    // security_events 테이블 적용 전에도 회원가입 로직은 계속 동작하게 둡니다.
  }
}

async function temporaryBlock(admin: ReturnType<typeof createAdminClient>, kind: string, value: string, reason: string, minutes = 30) {
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
    // 중복 또는 테이블 미적용 시 무시
  }
}

function signupError(error: AuthAdminError | null) {
  const text = String(error?.message ?? "").toLowerCase();
  const technicalCode = error?.code ?? error?.status;

  if (text.includes("already") || text.includes("registered") || text.includes("exists")) {
    return fail("이미 사용 중인 아이디입니다. 다른 아이디를 사용해 주세요.", 409, "LOGIN_ID_ALREADY_REGISTERED", technicalCode);
  }
  if (text.includes("rate limit") || text.includes("too many")) {
    return fail("회원가입 요청이 잠시 제한되었습니다. 몇 분 뒤 다시 시도해 주세요.", 429, "AUTH_RATE_LIMITED", technicalCode);
  }
  if (text.includes("signup") && text.includes("disabled")) {
    return fail("Supabase에서 신규 회원가입이 꺼져 있습니다. 관리자에게 문의해 주세요.", 503, "SIGNUP_DISABLED", technicalCode);
  }
  if (text.includes("password")) {
    return fail("비밀번호 조건을 충족하지 못했습니다. 8자 이상으로 다시 입력해 주세요.", 422, "PASSWORD_REJECTED", technicalCode);
  }
  if (text.includes("database") || text.includes("saving new user")) {
    return fail("회원 DB를 만드는 중 오류가 발생했습니다. 관리자에게 DB 보정 SQL 확인을 요청해 주세요.", 503, "PROFILE_CREATE_TRIGGER_FAILED", technicalCode);
  }

  return fail("가입 신청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", 400, "SIGNUP_FAILED", technicalCode);
}

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());
  }
  const login = validateLoginId(parsed.data.loginId);
  if (!login.ok) return fail(login.message, 422, "LOGIN_ID_INVALID");

  const { ip } = requestMeta(request);
  const limited = await enforceRateLimit(`signup:v130:${ip}`, 8, 60 * 10);
  if (limited) return limited;

  const admin = createAdminClient();
  let signupBypassBySuperAdmin = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: adminProfile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      signupBypassBySuperAdmin = adminProfile?.role === "SUPER_ADMIN";
    }
  } catch {}
  const fingerprint = String(parsed.data.browserFingerprint || "unknown").slice(0, 120);
  let riskScore = 0;
  const riskFlags: string[] = [];
  const elapsed = signupElapsedMs(parsed.data.signupStartedAt);

  if (!signupBypassBySuperAdmin && parsed.data.website.trim()) {
    await logSecurityEvent(admin, { eventType: "SIGNUP_HONEYPOT_BLOCK", severity: "HIGH", ip, browserFingerprint: fingerprint, loginId: login.loginId, displayName: parsed.data.displayName, reason: "honeypot field filled" });
    await temporaryBlock(admin, "IP", ip, "자동 가입 방어: honeypot 입력", 60);
    return fail("자동 가입으로 의심되어 가입 신청이 차단되었습니다.", 429, "SIGNUP_BOT_BLOCKED");
  }

  if (!signupBypassBySuperAdmin && elapsed !== null && elapsed < 2500) {
    await logSecurityEvent(admin, { eventType: "SIGNUP_TOO_FAST_BLOCK", severity: "HIGH", ip, browserFingerprint: fingerprint, loginId: login.loginId, displayName: parsed.data.displayName, elapsedMs: elapsed, reason: "form submitted too quickly" });
    await temporaryBlock(admin, "FINGERPRINT", fingerprint, "자동 가입 방어: 비정상적으로 빠른 제출", 30);
    return fail("가입 신청 속도가 비정상적으로 빠릅니다. 3분 뒤에 다시 시도해 주세요.", 429, "SIGNUP_TOO_FAST");
  }

  if (!signupBypassBySuperAdmin && looksAutomatedSignup(login.loginId, parsed.data.displayName)) {
    await logSecurityEvent(admin, { eventType: "SIGNUP_PATTERN_BLOCK", severity: "HIGH", ip, browserFingerprint: fingerprint, loginId: login.loginId, displayName: parsed.data.displayName, reason: "automated login/display pattern" });
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
    const blocked = ((blockedRows ?? []) as Array<{ reason?: string | null; expires_at?: string | null }>).find((row) => !row.expires_at || new Date(row.expires_at).getTime() > now);
    if (!signupBypassBySuperAdmin && blocked) {
      await logSecurityEvent(admin, { eventType: "SIGNUP_BLOCKLIST_HIT", severity: "HIGH", ip, browserFingerprint: fingerprint, loginId: login.loginId, displayName: parsed.data.displayName, reason: blocked.reason ?? "blocklist hit" });
      return fail("현재 가입 신청이 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.", 429, "SIGNUP_BLOCKLISTED");
    }
  } catch {
    // 보안 테이블 적용 전 호환
  }

  try {
    const cooldownSince = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const [recentDevice, recentIp] = await Promise.all([
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("browser_fingerprint", fingerprint).gte("created_at", cooldownSince),
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("ip_address", ip).gte("created_at", cooldownSince),
    ]);
    if (!signupBypassBySuperAdmin && ((fingerprint !== "unknown" && (recentDevice.count ?? 0) > 0) || (recentIp.count ?? 0) > 0)) {
      return fail("이미 회원가입을 요청하였습니다. 3분 뒤에 재시도 해주세요.", 429, "SIGNUP_DEVICE_COOLDOWN");
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [sameIp, sameFingerprint] = await Promise.all([
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("ip_address", ip).gte("created_at", since),
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("browser_fingerprint", fingerprint).gte("created_at", since),
    ]);
    if ((sameIp.count ?? 0) >= 2) { riskScore += 35; riskFlags.push("동일 IP 24시간 내 다중 가입"); }
    if (fingerprint !== "unknown" && (sameFingerprint.count ?? 0) >= 1) { riskScore += 45; riskFlags.push("동일 브라우저 지문 재가입 의심"); }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const [tenMinuteIp, tenMinuteFp] = await Promise.all([
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("ip_address", ip).gte("created_at", tenMinutesAgo),
      admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).eq("browser_fingerprint", fingerprint).gte("created_at", tenMinutesAgo),
    ]);
    if (!signupBypassBySuperAdmin && (tenMinuteIp.count ?? 0) >= 3) {
      await logSecurityEvent(admin, { eventType: "SIGNUP_IP_BURST_BLOCK", severity: "CRITICAL", ip, browserFingerprint: fingerprint, loginId: login.loginId, displayName: parsed.data.displayName, count: tenMinuteIp.count, reason: "too many signups from same IP" });
      await temporaryBlock(admin, "IP", ip, "10분 내 가입 신청 과다", 60);
      return fail("같은 네트워크에서 가입 신청이 너무 많습니다. 1시간 뒤에 다시 시도해 주세요.", 429, "SIGNUP_IP_BURST_BLOCKED");
    }
    if (!signupBypassBySuperAdmin && fingerprint !== "unknown" && (tenMinuteFp.count ?? 0) >= 1) {
      await logSecurityEvent(admin, { eventType: "SIGNUP_DEVICE_REPEAT_BLOCK", severity: "HIGH", ip, browserFingerprint: fingerprint, loginId: login.loginId, displayName: parsed.data.displayName, count: tenMinuteFp.count, reason: "same device repeated signup" });
      await temporaryBlock(admin, "FINGERPRINT", fingerprint, "동일 기기 반복 가입 신청", 180);
      return fail("이미 이 기기에서 가입 신청을 요청했습니다. 잠시 후 다시 시도해 주세요.", 429, "SIGNUP_DEVICE_REPEAT_BLOCKED");
    }
  } catch {
    // 중복가입 위험도 테이블이 아직 적용되지 않은 기존 설치와의 호환을 위해 무시합니다.
  }

  if (!signupBypassBySuperAdmin && riskScore >= 70) {
    await logSecurityEvent(admin, { eventType: "SIGNUP_RISK_BLOCK", severity: "HIGH", ip, browserFingerprint: fingerprint, loginId: login.loginId, displayName: parsed.data.displayName, riskScore, riskFlags, reason: "risk score threshold exceeded" });
    await temporaryBlock(admin, "IP", ip, "가입 위험도 초과", 60);
    return fail("중복 가입 또는 자동 가입으로 의심되어 가입 신청이 차단되었습니다.", 429, "SIGNUP_RISK_BLOCKED");
  }

  const authEmail = loginIdToAuthEmail(login.loginId);
  const { data: existing } = await admin.from("profiles").select("id").eq("username", login.loginId).maybeSingle();
  if (existing) return fail("이미 사용 중인 아이디입니다. 다른 아이디를 사용해 주세요.", 409, "LOGIN_ID_ALREADY_REGISTERED");

  let referredBy: string | null = null;
  const rawReferral = parsed.data.referralCode.trim();
  if (rawReferral && !/^[0-9]{1,8}$/.test(rawReferral)) {
    return fail("추천인 ID는 8자리 이내 숫자만 입력해 주세요.", 422, "REFERRAL_CODE_INVALID");
  }
  const normalizedReferral = normalizeReferralCodeInput(rawReferral);
  if (normalizedReferral) {
    let referrer: { id: string; username?: string | null; referral_code?: string | null; status?: string | null } | null = null;
    try {
      const { data: stableRef } = await admin
        .from("profile_referral_codes")
        .select("profile_id,referral_code")
        .eq("referral_code", normalizedReferral)
        .maybeSingle();
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

    if (!referrer) return fail("추천인 ID를 찾을 수 없습니다. 추천인에게 숫자 추천 ID를 다시 확인해 주세요.", 404, "REFERRER_NOT_FOUND");
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
    },
  });

  if (createError || !created.user) return signupError(createError);

  const ownReferralCode = await nextNumericReferralCode(admin, created.user.id);

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
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
    }, { onConflict: "id" });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    const duplicate = profileError.message.toLowerCase().includes("duplicate");
    return fail(
      duplicate ? "이미 사용 중인 아이디입니다. 다른 아이디를 사용해 주세요." : "회원 정보 저장에 실패했습니다. 관리자에게 DB 권한 보정 SQL 확인을 요청해 주세요.",
      duplicate ? 409 : 503,
      duplicate ? "LOGIN_ID_ALREADY_REGISTERED" : "PROFILE_CREATE_FAILED",
      profileError.code,
    );
  }

  await getStableReferralCode(admin, created.user.id, ownReferralCode);

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
      user_agent: request.headers.get("user-agent") || "unknown",
    });
  } catch {
    // 보정 SQL 적용 전 호환
  }

  return ok({
    userId: created.user.id,
    redirectTo: "/login",
    message: "가입 신청이 완료되었습니다. 관리자가 승인하면 같은 아이디와 비밀번호로 로그인할 수 있습니다.",
  }, 201);
}
