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

  const limited = await enforceRateLimit(`password-reset:${userId}`, 5, 60 * 15);
  if (limited) return limited;

  let passwordUpdated = false;
  let updateMessage = "";

  if (user) {
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (!error) passwordUpdated = true;
    else updateMessage = error.message;
  }

  if (!passwordUpdated) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: parsed.data.password,
      email_confirm: true,
    });
    if (!error) passwordUpdated = true;
    else updateMessage = error.message;
  }

  if (!passwordUpdated) {
    try {
      const { data, error } = await admin.rpc("dynamicd_set_password", {
        p_user_id: userId,
        p_password: parsed.data.password,
      });
      if (!error && data === true) passwordUpdated = true;
      else updateMessage = error?.message || "RPC_PASSWORD_UPDATE_FAILED";
    } catch (error) {
      updateMessage = error instanceof Error ? error.message : "RPC_PASSWORD_UPDATE_THROWN";
    }
  }

  if (!passwordUpdated) {
    return fail("비밀번호를 바꾸지 못했습니다. 다시 시도해 주세요.", 400, "PASSWORD_UPDATE_FAILED", { reason: updateMessage });
  }

  const now = new Date().toISOString();
  try {
    const { error } = await admin
      .from("profiles")
      .update({ must_change_password: false, password_changed_at: now, password_reset_at: null, updated_at: now })
      .eq("id", userId);
    if (error) {
      await admin
        .from("profiles")
        .update({ must_change_password: false, password_changed_at: now, updated_at: now })
        .eq("id", userId);
    }
  } catch {
    // 비밀번호 변경은 이미 성공했으므로 플래그 업데이트 실패는 로그인 자체를 막지 않는다.
  }

  const response = ok({ message: "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.", redirectTo: "/login?password_changed=1" });
  response.cookies.delete(EMERGENCY_SESSION_COOKIE);
  return response;
}
