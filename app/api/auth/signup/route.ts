import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta } from "@/lib/api";
import { loginIdToAuthEmail, validateLoginId } from "@/lib/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeReferralCode, normalizeReferralCodeInput } from "@/lib/reward-engine";

const schema = z.object({
  loginId: z.string().trim().min(1, "아이디를 입력해 주세요."),
  displayName: z.string().trim().min(2, "이름 또는 닉네임은 2자 이상 입력해 주세요.").max(30),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72),
  referralCode: z.string().trim().max(8, "추천인 ID는 8자리 이내 숫자만 입력해 주세요.").optional().default(""),
});

type AuthAdminError = { code?: string; message?: string; status?: number };

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
    const { data: referrer } = await admin
      .from("profiles")
      .select("id,username,referral_code,status")
      .eq("referral_code", normalizedReferral)
      .eq("status", "APPROVED")
      .maybeSingle();
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

  const { data: nextReferralCode } = await admin.rpc("next_numeric_referral_code");
  const ownReferralCode = typeof nextReferralCode === "string" && /^[0-9]{1,8}$/.test(nextReferralCode)
    ? nextReferralCode
    : makeReferralCode(created.user.id);

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

  if (referredBy) {
    await admin.from("referral_logs").insert({
      referrer_id: referredBy,
      referred_profile_id: created.user.id,
      referral_code: normalizedReferral,
      status: "PENDING",
    });
  }

  return ok({
    userId: created.user.id,
    redirectTo: "/login",
    message: "가입 신청이 완료되었습니다. 관리자가 승인하면 같은 아이디와 비밀번호로 로그인할 수 있습니다.",
  }, 201);
}
