import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, readJsonWithLimit } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeCustomPasswordHash } from "@/lib/custom-password";
import { getEmergencyProfileIdFromCookies } from "@/lib/emergency-session";

const schema = z.object({ password: z.string().min(8).max(72) });

type ProfileForReset = {
  id: string;
  email: string | null;
  username: string | null;
};

async function resolveProfileForReset(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<ProfileForReset | null> {
  const { data } = await admin.from("profiles").select("id,email,username").eq("id", userId).maybeSingle();
  return (data ?? null) as ProfileForReset | null;
}

async function saveCustomPassword(admin: ReturnType<typeof createAdminClient>, profile: ProfileForReset, password: string) {
  const now = new Date().toISOString();
  const passwordHash = makeCustomPasswordHash(password);
  const credential = String(profile.email || profile.username || profile.id).trim().toLowerCase();

  // 새 스키마: credential 컬럼 포함.
  try {
    const { error } = await admin.from("dynamicd_auth_credentials").upsert(
      {
        profile_id: profile.id,
        credential,
        password_hash: passwordHash,
        must_change_password: false,
        updated_at: now,
      },
      { onConflict: "profile_id" },
    );
    if (!error) return { ok: true as const };
  } catch {
    // 기존 스키마 fallback으로 계속 진행.
  }

  // 구 스키마: credential 컬럼이 없던 테이블도 지원.
  try {
    const { error } = await admin.from("dynamicd_auth_credentials").upsert(
      {
        profile_id: profile.id,
        password_hash: passwordHash,
        must_change_password: false,
        updated_at: now,
      },
      { onConflict: "profile_id" },
    );
    if (!error) return { ok: true as const };
    return { ok: false as const, reason: error.message };
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function syncSupabaseAuthPassword(admin: ReturnType<typeof createAdminClient>, userId: string, password: string) {
  // 이건 보조 작업이다. 실패해도 custom password가 성공하면 로그인은 된다.
  try {
    await admin.rpc("dynamicd_set_password", { p_user_id: userId, p_password: password });
  } catch {}

  try {
    await admin.rpc("dynamicd_set_login_password", { p_profile_id: userId, p_password: password, p_must_change: false });
  } catch {}

  try {
    await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  } catch {}
}

async function clearRecoveryFlags(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const now = new Date().toISOString();

  try {
    await admin
      .from("profiles")
      .update({ must_change_password: false, password_changed_at: now, password_reset_at: null, updated_at: now })
      .eq("id", userId);
    return;
  } catch {}

  try {
    await admin.from("profiles").update({ must_change_password: false, password_changed_at: now, updated_at: now }).eq("id", userId);
    return;
  } catch {}

  try {
    await admin.from("profiles").update({ updated_at: now }).eq("id", userId);
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
  const admin = createAdminClient();
  const emergencyProfileId = await getEmergencyProfileIdFromCookies();
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const userId = user?.id ?? emergencyProfileId;

  if (!userId) return fail("로그인 세션이 없습니다. 다시 로그인해 주세요.", 401, "RECOVERY_SESSION_MISSING");

  const limited = await enforceRateLimit(`password-reset:${userId}`, 20, 60 * 15);
  if (limited) return limited;

  const profile = await resolveProfileForReset(admin, userId);
  if (!profile) return fail("회원 정보를 찾지 못했습니다. 다시 로그인해 주세요.", 404, "PROFILE_MISSING");

  const password = parsed.data.password;
  const saved = await saveCustomPassword(admin, profile, password);
  if (!saved.ok) {
    return fail("비밀번호를 바꾸지 못했습니다. 다시 시도해 주세요.", 400, "PASSWORD_UPDATE_FAILED", { reason: saved.reason });
  }

  await syncSupabaseAuthPassword(admin, userId, password);
  await clearRecoveryFlags(admin, userId);

  // 복구 세션은 유지한다. 저장 직후 바로 계정 화면으로 보낸다.
  // 사용자가 로그아웃 후 다시 로그인하면 방금 저장한 새 비밀번호가 custom table에서 검증된다.
  return ok({ message: "비밀번호가 변경되었습니다.", redirectTo: "/account" });
}