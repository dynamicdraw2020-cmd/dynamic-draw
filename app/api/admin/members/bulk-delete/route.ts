import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ reason: z.string().trim().min(2).max(300) });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("SUPER_ADMIN"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("삭제 사유를 2자 이상 입력해 주세요.", 422);
  const admin = createAdminClient();
  const { data: targets, error: targetError } = await admin
    .from("profiles")
    .select("id,display_name,username,email,role,status")
    .neq("role", "SUPER_ADMIN")
    .neq("id", guard.auth.userId)
    .neq("status", "DELETED");
  if (targetError) return fail("삭제 대상 회원을 불러오지 못했습니다.", 400, "MEMBER_BULK_DELETE_TARGET_FAILED", targetError.message);
  const ids = (targets ?? []).map((member) => member.id);
  if (!ids.length) return ok({ deletedCount: 0 });
  const deletedAt = new Date().toISOString();
  const { error } = await admin.from("profiles").update({ status: "DELETED", rejection_reason: parsed.data.reason, deleted_at: deletedAt }).in("id", ids);
  if (error) return fail("전체 회원 삭제 처리에 실패했습니다.", 400, "MEMBER_BULK_DELETE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "MEMBERS_BULK_DELETED", p_target_table: "profiles", p_target_id: guard.auth.userId, p_details: { deletedCount: ids.length, reason: parsed.data.reason, sample: targets?.slice(0, 20) ?? [] }, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok({ deletedCount: ids.length, deletedAt });
}
