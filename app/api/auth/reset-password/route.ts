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
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const userId = user?.id ?? emergencyProfileId;

  if (!userId) return fail("로그인 세션이 없습니다. 다시 로그인해 주세요.", 401, "RECOVERY_SESSION_MISSING");

  const limited = await enforceRateLimit(`password-reset:${userId}`, 20, 60 * 15);
  if (limited) return limited;

  const password = parsed.data.password;
  let passwordUpdated = false;
  const reasons: string[] = [];

  // 1) 프로젝트 전용 복구 패스워드 저장소를 먼저 갱신한다. 이게 성공하면 이후 로그인은 Supabase Auth 401과 무관하게 통과한다.
  try {
    const { data, error } = await admin.rpc("dynamicd_set_login_password", {
      p_profile_id: userId,
      p_password: password,
      p_must_change: false,
    });
    if (!error && data === true) passwordUpdated = true;
    else reasons.push(error?.message || "dynamicd_set_login_password returned false");
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }

  // 2) Supabase Auth 세션이 살아 있으면 정식 updateUser도 시도한다. 실패해도 1번이 성공했으면 성공 처리한다.
  if (user) {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (!error) passwordUpdated = true;
      else reasons.push(error.message);
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
  }

  // 3) service role Admin API도 보조로 시도한다.
  try {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (!error) passwordUpdated = true;
    else reasons.push(error.message);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }

  if (!passwordUpdated) {
    return fail("비밀번호를 바꾸지 못했습니다. 다시 시도해 주세요.", 400, "PASSWORD_UPDATE_FAILED", { reason: reasons.join(" | ") });
  }

  const now = new Date().toISOString();
  await admin
    .from("profiles")
    .update({ must_change_password: false, password_changed_at: now, password_reset_at: null, updated_at: now })
    .eq("id", userId)
    .then(undefined, () => undefined);

  const response = ok({ message: "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.", redirectTo: "/login?password_changed=1" });
  response.cookies.delete(EMERGENCY_SESSION_COOKIE);
  await supabase.auth.signOut().catch(() => undefined);
  return response;
}
