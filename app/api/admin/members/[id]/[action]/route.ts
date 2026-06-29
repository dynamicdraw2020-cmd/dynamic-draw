import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApprovalRewards } from "@/lib/reward-engine";

const approveSchema = z.object({
  memberCode: z.string().trim().toUpperCase().regex(/^DD-\d{4}-[A-Z0-9]{4,12}$/, "고유 ID 형식은 DD-2026-001001처럼 입력해 주세요.").optional(),
});
const reasonSchema = z.object({ reason: z.string().trim().min(2).max(300) });

async function obtainMemberCode(admin: ReturnType<typeof createAdminClient>, requested?: string) {
  if (requested) return requested;
  const { data, error } = await admin.rpc("next_member_code");
  if (error || typeof data !== "string") throw new Error(error?.message ?? "고유 ID를 자동 생성하지 못했습니다.");
  return data;
}

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id, action } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("잘못된 회원 ID입니다.", 400);
  if (!new Set(["approve", "reject", "suspend", "restore", "delete"]).has(action)) return fail("지원하지 않는 회원 처리입니다.", 404);

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id,email,username,display_name,member_code,role,status").eq("id", id).maybeSingle();
  if (!target) return fail("회원을 찾을 수 없습니다.", 404);
  if (target.id === guard.auth.userId && ["reject", "suspend", "delete"].includes(action)) {
    return fail("현재 로그인한 본인 계정은 반려하거나 정지할 수 없습니다.", 409, "SELF_STATUS_CHANGE_BLOCKED");
  }
  if (target.role !== "USER" && guard.auth.profile.role !== "SUPER_ADMIN") {
    return fail("관리자 계정 상태는 최고 관리자만 변경할 수 있습니다.", 403, "ADMIN_ACCOUNT_PROTECTED");
  }
  if (target.role === "SUPER_ADMIN" && ["suspend", "delete"].includes(action)) {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "SUPER_ADMIN").eq("status", "APPROVED");
    if ((count ?? 0) <= 1) return fail("최고 관리자는 최소 한 명이 남아 있어야 합니다.", 409, "LAST_SUPER_ADMIN");
  }

  const body = await request.json().catch(() => ({}));
  let update: Record<string, unknown>;
  let logAction: string;

  if (action === "approve") {
    if (target.status !== "PENDING") return fail("승인 대기 회원만 승인할 수 있습니다.", 409, "INVALID_MEMBER_STATUS");
    const parsed = approveSchema.safeParse(body); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "고유 ID를 확인해 주세요.", 422);
    let memberCode: string;
    try { memberCode = await obtainMemberCode(admin, parsed.data.memberCode); }
    catch (error) { return fail((error as Error).message, 500, "MEMBER_CODE_GENERATION_FAILED"); }
    update = { status: "APPROVED", member_code: memberCode, approved_by: guard.auth.userId, approved_at: new Date().toISOString(), rejection_reason: null };
    logAction = "MEMBER_APPROVED";
  } else if (action === "reject") {
    if (target.status !== "PENDING") return fail("승인 대기 회원만 반려할 수 있습니다.", 409, "INVALID_MEMBER_STATUS");
    const parsed = reasonSchema.safeParse(body); if (!parsed.success) return fail("사유를 2자 이상 입력해 주세요.", 422);
    update = { status: "REJECTED", rejection_reason: parsed.data.reason };
    logAction = "MEMBER_REJECTED";
  } else if (action === "suspend") {
    if (target.status !== "APPROVED") return fail("승인된 회원만 정지할 수 있습니다.", 409, "INVALID_MEMBER_STATUS");
    const parsed = reasonSchema.safeParse(body); if (!parsed.success) return fail("사유를 2자 이상 입력해 주세요.", 422);
    update = { status: "SUSPENDED", rejection_reason: parsed.data.reason };
    logAction = "MEMBER_SUSPENDED";
  } else if (action === "delete") {
    if (guard.auth.profile.role !== "SUPER_ADMIN") return fail("회원 삭제는 최고 관리자만 가능합니다.", 403, "SUPER_ADMIN_REQUIRED");
    const parsed = reasonSchema.safeParse(body); if (!parsed.success) return fail("삭제 사유를 2자 이상 입력해 주세요.", 422);
    update = { status: "DELETED", rejection_reason: parsed.data.reason, deleted_at: new Date().toISOString() };
    logAction = "MEMBER_DELETED";
  } else {
    if (!["REJECTED", "SUSPENDED", "DELETED"].includes(target.status)) return fail("반려·정지·삭제된 회원만 복구할 수 있습니다.", 409, "INVALID_MEMBER_STATUS");
    let memberCode = target.member_code;
    if (!memberCode) {
      const parsed = approveSchema.safeParse(body); if (!parsed.success) return fail("고유 ID 입력값을 확인해 주세요.", 422);
      try { memberCode = await obtainMemberCode(admin, parsed.data.memberCode); }
      catch (error) { return fail((error as Error).message, 500, "MEMBER_CODE_GENERATION_FAILED"); }
    }
    update = { status: "APPROVED", member_code: memberCode, rejection_reason: null, approved_by: guard.auth.userId, approved_at: new Date().toISOString() };
    logAction = "MEMBER_RESTORED";
  }

  const { data, error } = await admin.from("profiles").update(update).eq("id", id).select("id,email,username,display_name,member_code,role,status").single();
  if (error) {
    if (error.code === "23505") return fail("이미 사용 중인 고유 ID입니다.", 409, "MEMBER_CODE_DUPLICATE");
    return fail("회원 상태를 변경하지 못했습니다.", 400, "MEMBER_UPDATE_FAILED", error.message);
  }
  if (action === "approve") {
    await handleApprovalRewards(admin, id, guard.auth.userId);
  }

  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: logAction,
    p_target_table: "profiles",
    p_target_id: id,
    p_details: { before: target, after: data },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });
  return ok(data);
}
