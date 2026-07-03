import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, ok, rejectDemoMutation, requestMeta, readJsonWithLimit } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.email().transform((value) => value.toLowerCase()) });

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  const { ip } = requestMeta(request);
  const limited = await enforceRateLimit(`password-reset-request:${ip}`, 5, 60 * 15);
  if (limited) return limited;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  // 계정 존재 여부를 외부에 드러내지 않기 위해 잘못된 형식 외에는 같은 메시지를 반환합니다.
  if (parsed.success) {
    const supabase = await createClient();
    const origin = new URL(request.url).origin;
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${origin}/auth/confirm?next=/reset-password`,
    });
  }

  return ok({
    message: "가입된 이메일이라면 비밀번호 재설정 안내를 보냈습니다. 받은편지함과 스팸함을 확인해 주세요.",
  });
}
