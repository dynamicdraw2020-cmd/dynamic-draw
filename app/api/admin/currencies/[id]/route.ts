import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
const patchSchema = z.object({ isActive: z.boolean().optional(), name: z.string().trim().min(2).max(40).optional(), symbol: z.string().trim().min(1).max(8).optional() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params; const parsed = patchSchema.safeParse(await readJsonWithLimit(request).catch(() => null)); if (!parsed.success) return fail("화폐 정보를 확인해 주세요.", 422);
  const patch: Record<string, unknown> = {}; if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive; if (parsed.data.name !== undefined) patch.name = parsed.data.name; if (parsed.data.symbol !== undefined) patch.symbol = parsed.data.symbol;
  const admin = createAdminClient(); const { data, error } = await admin.from("virtual_currencies").update(patch).eq("id", id).is("deleted_at", null).select("*").single();
  if (error) return fail("화폐를 수정하지 못했습니다.", 400, "CURRENCY_UPDATE_FAILED", error.message);
  const meta = requestMeta(request); await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "VIRTUAL_CURRENCY_UPDATED", p_target_table: "virtual_currencies", p_target_id: id, p_details: patch, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data);
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params; const admin = createAdminClient();
  await admin.from("ticket_exchange_rates").delete().eq("currency_id", id);
  const { error } = await admin.from("virtual_currencies").update({ is_active: false, deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail("화폐를 삭제하지 못했습니다.", 400, "CURRENCY_DELETE_FAILED", error.message);
  const meta = requestMeta(request); await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "VIRTUAL_CURRENCY_DELETED", p_target_table: "virtual_currencies", p_target_id: id, p_details: {}, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok({ id, deleted: true });
}
