import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
const schema = z.object({ drawId: z.uuid(), currencyId: z.uuid(), currencyCost: z.number().int().min(1).max(1_000_000), ticketQuantity: z.number().int().min(1).max(1000) });
export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "교환 비율을 확인해 주세요.", 422);
  const admin = createAdminClient(); const { data: maxRow } = await admin.from("ticket_exchange_rates").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("ticket_exchange_rates").insert({ draw_id: parsed.data.drawId, currency_id: parsed.data.currencyId, currency_cost: parsed.data.currencyCost, ticket_quantity: parsed.data.ticketQuantity, created_by: guard.auth.userId, sort_order: (maxRow?.sort_order ?? 0) + 10 }).select("*").single();
  if (error) return fail("추첨권 교환 비율을 만들지 못했습니다.", 400, "TICKET_RATE_CREATE_FAILED", error.message);
  const meta = requestMeta(request); await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "TICKET_EXCHANGE_RATE_CREATED", p_target_table: "ticket_exchange_rates", p_target_id: data.id, p_details: data, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data, 201);
}
