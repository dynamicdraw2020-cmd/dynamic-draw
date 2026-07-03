import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, withApiRoute } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEMPORARY_PASSWORD } from "@/lib/password-reset";

export const dynamic = "force-dynamic";
export const maxDuration = 10;
export const runtime = "nodejs";

async function postHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiAdmin("SUPER_ADMIN");
  if ("error" in guard) return guard.error;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("잘못된 회원 ID입니다.", 400, "INVALID_MEMBER_ID");
  if (id === guard.auth.userId) return fail("현재 로그인한 본인 계정은 이 버튼으로 초기화하지 말고 비밀번호 변경 화면을 사용해 주세요.", 409, "SELF_PASSWORD_RESET_BLOCKED");

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id,email,username,display_name,role,status")
    .eq("id", id)
    .maybeSingle();

  if (targetError || !target) return fail("회원을 찾을 수 없습니다.", 404, "MEMBER_NOT_FOUND", targetError?.message);
  if (String(target.status) === "DELETED") return fail("삭제 처리된 회원은 비밀번호를 초기화할 수 없습니다.", 409, "DELETED_MEMBER");
  if (String(target.role) === "SUPER_ADMIN") return fail("최고 관리자 계정은 개별 비밀번호 변경 화면에서 직접 변경해 주세요.", 409, "SUPER_ADMIN_PASSWORD_RESET_BLOCKED");

  const { error: authError } = await admin.auth.admin.updateUserById(id, { password: TEMPORARY_PASSWORD });
  if (authError) return fail("Auth 비밀번호를 초기화하지 못했습니다. auth.users에 계정이 있는지 확인해 주세요.", 400, "AUTH_PASSWORD_RESET_FAILED", authError.message);

  const now = new Date().toISOString();
  const { error: profileError } = await admin
    .from("profiles")
    .update({ must_change_password: true, password_reset_at: now, password_changed_at: null, updated_at: now })
    .eq("id", id);

  if (profileError) return fail("비밀번호는 초기화됐지만 profiles 상태 업데이트에 실패했습니다.", 500, "PROFILE_PASSWORD_FLAG_FAILED", profileError.message);

  const meta = requestMeta(request);
  try {
    await admin.rpc("append_admin_log", {
      p_admin_id: guard.auth.userId,
      p_action: "MEMBER_PASSWORD_RESET",
      p_target_table: "profiles",
      p_target_id: id,
      p_details: { username: target.username, email: target.email, temporaryPasswordApplied: true },
      p_ip: meta.ip,
      p_user_agent: meta.userAgent,
    });
  } catch {}

  return ok({
    id,
    username: target.username,
    email: target.email,
    temporaryPassword: TEMPORARY_PASSWORD,
    mustChangePassword: true,
  });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/admin/members/[id]/reset-password", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
