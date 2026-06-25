import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  displayName: z.string().trim().min(2, "이름은 2자 이상 입력해 주세요.").max(30),
  phone: z.string().trim().max(20).optional().default(""),
  email: z.email("올바른 이메일 주소를 입력해 주세요.").transform((value) => value.toLowerCase()),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72),
});

type AuthAdminError = { code?: string; message?: string; status?: number };

function signupError(error: AuthAdminError | null) {
  const text = String(error?.message ?? "").toLowerCase();
  const technicalCode = error?.code ?? error?.status;

  if (text.includes("already") || text.includes("registered") || text.includes("exists")) {
    return fail("이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.", 409, "EMAIL_ALREADY_REGISTERED", technicalCode);
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
  if (text.includes("email") && text.includes("invalid")) {
    return fail("사용할 수 없는 이메일 형식입니다.", 422, "EMAIL_INVALID", technicalCode);
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

  const { ip } = requestMeta(request);
  const limited = await enforceRateLimit(`signup:${ip}`, 8, 60 * 10);
  if (limited) return limited;

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      display_name: parsed.data.displayName,
      phone: parsed.data.phone,
    },
  });

  if (createError || !created.user) return signupError(createError);

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: created.user.id,
      email: parsed.data.email,
      display_name: parsed.data.displayName,
      phone: parsed.data.phone || null,
      role: "USER",
      status: "PENDING",
      member_code: null,
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
    }, { onConflict: "id" });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return fail(
      "회원 정보 저장에 실패했습니다. 관리자에게 DB 권한 보정 SQL 확인을 요청해 주세요.",
      503,
      "PROFILE_CREATE_FAILED",
      profileError.code,
    );
  }

  return ok({
    userId: created.user.id,
    redirectTo: "/login",
    message: "가입 신청이 완료되었습니다. 관리자가 승인하면 같은 이메일과 비밀번호로 로그인할 수 있습니다.",
  }, 201);
}
