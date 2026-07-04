import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, readJsonWithLimit } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmergencyProfileIdFromCookies, EMERGENCY_SESSION_COOKIE } from "@/lib/emergency-session";

const schema = z.object({ password: z.string().min(8).max(72) });

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("새 비밀번호는 8자 이상 입력해 주세요.", 422, "VALIDATION_ERROR");

  const supabase = await createClient();
  const admin = createAdminClient();
  const emergencyProfileId = await getEmergencyProfileIdFromCookies();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? emergencyProfileId;

  if (!userId) return fail("로그인 세션이 없습니다. 다시 로그인해 주세요.", 401, "RECOVERY_SESSION_MISSING");

  const limited = await enforceRateLimit(`password-reset:${userId}`, 20, 60 * 15);
  if (limited) return limited;

  let passwordUpdated = false;
  let updateReason = "";

  // Supabase 정식 세션이 있으면 정식 API부터 시도한다.
  if (user) {
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (!error) passwordUpdated = true;
    else updateReason = error.message;
  }

  // 복구 세션 또는 정식 API 실패 시 service-role Admin API로 시도한다.
  if (!passwordUpdated) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: parsed.data.password,
      email_confirm: true,
    });
    if (!error) passwordUpdated = true;
    else updateReason = error.message;
  }

  // Admin API도 막히는 복구 DB에서는 RPC로 auth.users 해시를 직접 갱신한다.
  if (!passwordUpdated) {
    const { data, error } = await admin.rpc("dynamicd_set_password", {
      p_user_id: userId,
      p_password: parsed.data.password,
    });
    if (!error && data === true) passwordUpdated = true;
    else updateReason = error?.message || updateReason || "RPC_PASSWORD_UPDATE_FAILED";
  }

  if (!passwordUpdated) {
    return fail("비밀번호를 바꾸지 못했습니다. 다시 시도해 주세요.", 400, "PASSWORD_UPDATE_FAILED", { reason: updateReason });
  }

  const now = new Date().toISOString();
  await admin
    .from("profiles")
    .update({ must_change_password: false, password_changed_at: now, password_reset_at: null, updated_at: now })
    .eq("id", userId);

  const response = ok({ message: "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.", redirectTo: "/login?password_changed=1" });
  response.cookies.delete(EMERGENCY_SESSION_COOKIE);
  return response;
}
