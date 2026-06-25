import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  displayName: z.string().trim().min(2, "이름은 2자 이상 입력해 주세요.").max(30),
  phone: z.string().trim().max(20).optional().default(""),
  email: z.email("올바른 이메일 주소를 입력해 주세요.").transform((value) => value.toLowerCase()),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72),
});

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  const { ip } = requestMeta(request);
  const limited = await enforceRateLimit(`signup:${ip}`, 5, 60 * 10);
  if (limited) return limited;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());

  const supabase = await createClient();
  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=/pending`,
      data: { display_name: parsed.data.displayName, phone: parsed.data.phone },
    },
  });
  if (error) {
    const duplicate = error.message.toLowerCase().includes("already") || error.message.toLowerCase().includes("registered");
    return fail(duplicate ? "이미 가입된 이메일입니다." : "가입 신청을 처리하지 못했습니다.", 400, "SIGNUP_FAILED");
  }

  return ok({
    userId: data.user?.id,
    redirectTo: data.session ? "/pending" : "/login",
    message: data.session
      ? "가입 신청이 완료되었습니다. 관리자 승인을 기다려 주세요."
      : "가입 신청이 완료되었습니다. 이메일 인증 후 로그인해 주세요.",
  }, 201);
}
