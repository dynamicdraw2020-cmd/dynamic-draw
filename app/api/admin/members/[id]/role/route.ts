import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ role: z.enum(["USER", "VIEWER", "CS_MANAGER", "MANAGER", "SUPER_ADMIN"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiAdmin("SUPER_ADMIN");
  if ("error" in guard) return guard.error;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("잘못된 회원 ID입니다.", 400);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("변경할 역할을 확인해 주세요.", 422);

  if (id === guard.auth.userId && parsed.data.role !== "SUPER_ADMIN") {
    return fail("현재 로그인한 최고 관리자 본인의 권한은 낮출 수 없습니다.", 409, "SELF_DEMOTION_BLOCKED");
  }

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id,email,username,display_name,role,status").eq("id", id).maybeSingle();
  if (!target) return fail("회원을 찾을 수 없습니다.", 404);

  if (parsed.data.role !== "USER" && target.status !== "APPROVED") {
    return fail("승인된 회원만 관리자로 지정할 수 있습니다.", 409, "MEMBER_NOT_APPROVED");
  }

  if (target.role === "SUPER_ADMIN" && parsed.data.role !== "SUPER_ADMIN") {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "SUPER_ADMIN").eq("status", "APPROVED");
    if ((count ?? 0) <= 1) return fail("최고 관리자는 최소 한 명이 남아 있어야 합니다.", 409, "LAST_SUPER_ADMIN");
  }

  const { data, error } = await admin
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", id)
    .select("id,email,username,display_name,role,status")
    .single();

  if (error) return fail("관리자 권한을 변경하지 못했습니다.", 400, "ROLE_UPDATE_FAILED", error.message);

  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "MEMBER_ROLE_CHANGED",
    p_target_table: "profiles",
    p_target_id: id,
    p_details: { beforeRole: target.role, afterRole: data.role, username: data.username },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok(data);
}
