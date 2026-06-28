import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
const patchSchema = z.object({ isActive: z.boolean().optional(), currencyCost: z.number().int().min(1).max(1_000_000).optional(), ticketQuantity: z.number().int().min(1).max(1000).optional() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params; const parsed = patchSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail("교환비를 확인해 주세요.", 422);
  const patch: Record<string, unknown> = {}; if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive; if (parsed.data.currencyCost !== undefined) patch.currency_cost = parsed.data.currencyCost; if (parsed.data.ticketQuantity !== undefined) patch.ticket_quantity = parsed.data.ticketQuantity;
  const admin = createAdminClient(); const { data, error } = await admin.from("ticket_exchange_rates").update(patch).eq("id", id).is("deleted_at", null).select("*").single();
  if (error) return fail("교환비를 수정하지 못했습니다.", 400, "TICKET_RATE_UPDATE_FAILED", error.message);
  const meta = requestMeta(request); await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "TICKET_EXCHANGE_RATE_UPDATED", p_target_table: "ticket_exchange_rates", p_target_id: id, p_details: patch, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data);
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params; const admin = createAdminClient();
  const { data: rate } = await admin.from("ticket_exchange_rates").select("id,draw_id,currency_id,currency_cost,ticket_quantity").eq("id", id).maybeSingle();
  if (!rate) return fail("교환비를 찾을 수 없습니다.", 404, "TICKET_RATE_NOT_FOUND");
  const { error } = await admin.from("ticket_exchange_rates").delete().eq("id", id);
  if (error) return fail("교환비를 삭제하지 못했습니다.", 400, "TICKET_RATE_DELETE_FAILED", error.message);
  const meta = requestMeta(request); await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "TICKET_EXCHANGE_RATE_DELETED", p_target_table: "ticket_exchange_rates", p_target_id: id, p_details: rate, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok({ id, deleted: true });
}
