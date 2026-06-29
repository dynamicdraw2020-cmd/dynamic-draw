import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
const schema = z.object({ drawId: z.uuid(), currencyId: z.uuid(), currencyCost: z.number().int().min(1).max(1_000_000), ticketQuantity: z.number().int().min(1).max(1000) });
export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "교환 비율을 확인해 주세요.", 422);
  const admin = createAdminClient();
  const { data: draw } = await admin.from("draws").select("id,name,status,deleted_at").eq("id", parsed.data.drawId).maybeSingle();
  if (!draw || draw.deleted_at || draw.status === "ENDED") return fail("사용 가능한 뽑기를 선택해 주세요.", 404, "DRAW_NOT_AVAILABLE");
  const { data: currency } = await admin.from("virtual_currencies").select("id,name,is_active,deleted_at").eq("id", parsed.data.currencyId).maybeSingle();
  if (!currency || !currency.is_active || currency.deleted_at) return fail("사용 가능한 화폐를 선택해 주세요.", 404, "CURRENCY_NOT_AVAILABLE");
  const { data: existing } = await admin.from("ticket_exchange_rates").select("id").eq("draw_id", parsed.data.drawId).eq("currency_id", parsed.data.currencyId).maybeSingle();
  const { data: maxRow } = await admin.from("ticket_exchange_rates").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const payload: Record<string, unknown> = { draw_id: parsed.data.drawId, currency_id: parsed.data.currencyId, currency_cost: parsed.data.currencyCost, ticket_quantity: parsed.data.ticketQuantity, created_by: guard.auth.userId, is_active: true, deleted_at: null };
  if (!existing?.id) payload.sort_order = (maxRow?.sort_order ?? 0) + 10;
  const query = existing?.id ? admin.from("ticket_exchange_rates").update(payload).eq("id", existing.id).select("*").single() : admin.from("ticket_exchange_rates").insert(payload).select("*").single();
  const { data, error } = await query;
  if (error) return fail("추첨권 교환 비율을 만들지 못했습니다.", 400, "TICKET_RATE_CREATE_FAILED", error.message);
  await admin.from("draws").update({ is_public: true }).eq("id", parsed.data.drawId);
  const meta = requestMeta(request); await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "TICKET_EXCHANGE_RATE_CREATED", p_target_table: "ticket_exchange_rates", p_target_id: data.id, p_details: data, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data, 201);
}
