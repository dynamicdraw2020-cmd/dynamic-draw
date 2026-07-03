import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, readJsonWithLimit } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireServerSecrets } from "@/lib/env";
import { getEmergencyProfileIdFromCookies, EMERGENCY_SESSION_COOKIE } from "@/lib/emergency-session";

const schema = z.object({ password: z.string().min(8).max(72) });

type AdminUpdateResult = { ok: true } | { ok: false; message: string };

async function updatePasswordWithAdmin(userId: string, password: string): Promise<AdminUpdateResult> {
  const admin = createAdminClient();

  // 1) Supabase JS Admin API 먼저 시도
  try {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (!error) return { ok: true };
  } catch {
    // 아래 REST fallback으로 계속 진행
  }

  // 2) supabase-js가 쿠키/런타임 문제로 실패하는 경우를 대비한 REST Admin API fallback
  try {
    const { url, secretKey } = requireServerSecrets();
    const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password, email_confirm: true }),
      cache: "no-store",
    });

    if (response.ok) return { ok: true };

    let message = `REST_ADMIN_UPDATE_FAILED_${response.status}`;
    try {
      const body = await response.json();
      message = String(body?.message || body?.error_description || body?.error || message);
    } catch {}
    return { ok: false, message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "UNKNOWN_ADMIN_UPDATE_ERROR" };
  }
}

async function clearRecoveryFlags(userId: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // DB마다 컬럼이 조금씩 달라서, 실패해도 비밀번호 변경 성공 자체는 막지 않는다.
  try {
    await admin
      .from("profiles")
      .update({
        must_change_password: false,
        password_changed_at: now,
        password_reset_at: null,
        updated_at: now,
      })
      .eq("id", userId);
    return;
  } catch {}

  try {
    await admin
      .from("profiles")
      .update({
        must_change_password: false,
        password_changed_at: now,
        updated_at: now,
      })
      .eq("id", userId);
    return;
  } catch {}

  try {
    await admin
      .from("profiles")
      .update({ updated_at: now })
      .eq("id", userId);
  } catch {}
}

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("새 비밀번호는 8자 이상 입력해 주세요.", 422, "VALIDATION_ERROR");

  const supabase = await createClient();
  const emergencyProfileId = await getEmergencyProfileIdFromCookies();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? emergencyProfileId;

  if (!userId) return fail("로그인 세션이 없습니다. 다시 로그인해 주세요.", 401, "RECOVERY_SESSION_MISSING");

  const limited = await enforceRateLimit(`password-reset:${userId}`, 10, 60 * 15);
  if (limited) return limited;

  // Supabase 세션이 있더라도, 복구 플로우에서는 Admin API로 확정 업데이트한다.
  const adminUpdate = await updatePasswordWithAdmin(userId, parsed.data.password);
  if (!adminUpdate.ok) {
    return fail("비밀번호를 바꾸지 못했습니다. 다시 시도해 주세요.", 400, "PASSWORD_UPDATE_FAILED", { reason: adminUpdate.message });
  }

  await clearRecoveryFlags(userId);

  try {
    await supabase.auth.signOut();
  } catch {}

  const response = ok({ message: "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.", redirectTo: "/login?password_changed=1" });
  response.cookies.delete(EMERGENCY_SESSION_COOKIE);
  return response;
}
