import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, readJsonWithLimit } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ password: z.string().min(8).max(72) });

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("새 비밀번호는 8자 이상 입력해 주세요.", 422, "VALIDATION_ERROR");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("로그인 세션이 없습니다. 다시 로그인해 주세요.", 401, "RECOVERY_SESSION_MISSING");
  const limited = await enforceRateLimit(`password-reset:${user.id}`, 5, 60 * 15);
  if (limited) return limited;

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail("비밀번호를 바꾸지 못했습니다. 다시 시도해 주세요.", 400, "PASSWORD_UPDATE_FAILED");

  try {
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ must_change_password: false, password_changed_at: new Date().toISOString(), password_reset_at: null, updated_at: new Date().toISOString() })
      .eq("id", user.id);
  } catch {
    // 비밀번호 변경은 이미 성공했으므로 플래그 업데이트 실패는 로그인 자체를 막지 않는다.
  }

  return ok({ message: "비밀번호가 변경되었습니다.", redirectTo: "/account" });
}
