import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("이벤트 ID가 올바르지 않습니다.", 400);
  const admin = createAdminClient();
  const { data: before } = await admin.from("events").select("*").eq("id", id).maybeSingle();
  const { error } = await admin.from("events").delete().eq("id", id);
  if (error) return fail("이벤트를 삭제하지 못했습니다.", 400, "EVENT_DELETE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "EVENT_DELETED", p_target_table: "events", p_target_id: id, p_details: before ?? {}, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok({ id, deleted: true });
}
