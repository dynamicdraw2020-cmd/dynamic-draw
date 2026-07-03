import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, readJsonWithLimit, withApiRoute } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

const schema = z.object({
  password: z.string().min(8, "새 비밀번호는 8자 이상이어야 합니다.").max(72),
  passwordConfirm: z.string().min(8).max(72),
}).refine((value) => value.password === value.passwordConfirm, {
  message: "비밀번호 확인이 일치하지 않습니다.",
  path: ["passwordConfirm"],
});

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "새 비밀번호를 확인해 주세요.", 422, "VALIDATION_ERROR");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("로그인이 필요합니다.", 401, "UNAUTHORIZED");

  const limited = await enforceRateLimit(`change-password:${user.id}`, 5, 60 * 15);
  if (limited) return limited;

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail("비밀번호를 변경하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.", 400, "PASSWORD_UPDATE_FAILED", error.message);

  const now = new Date().toISOString();
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      must_change_password: false,
      password_changed_at: now,
      password_reset_at: null,
      updated_at: now,
    })
    .eq("id", user.id);

  return ok({ message: "비밀번호가 변경되었습니다.", redirectTo: "/" });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/auth/change-password", rateLimit: { kind: "recovery", limit: 5, windowSeconds: 60 * 15 } });
