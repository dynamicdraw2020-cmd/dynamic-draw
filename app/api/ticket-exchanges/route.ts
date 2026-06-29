import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  rateId: z.uuid(),
  bundleCount: z.number().int().min(1).max(100),
  idempotencyKey: z.uuid(),
});

type RateRow = {
  id: string;
  draw_id: string;
  currency_id: string;
  currency_cost: number;
  ticket_quantity: number;
  is_active: boolean;
  deleted_at?: string | null;
};
type DrawRow = { id: string; name: string; status: string; is_public: boolean; deleted_at?: string | null };
type CurrencyRow = { id: string; name: string; symbol: string; is_active: boolean; deleted_at?: string | null };
type BalanceRow = { profile_id: string; currency_id: string; balance: number };
type TicketRow = { profile_id: string; draw_id: string; quantity: number };
type ExistingLogRow = { id: string; balance_after: number; amount: number; memo: string | null };

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? fallback);
  return fallback;
}

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;
  const limited = await enforceRateLimit(`ticket-exchange:${guard.auth.userId}`, 20, 60);
  if (limited) return limited;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("교환 요청을 확인해 주세요.", 422);

  const admin = createAdminClient();
  const meta = requestMeta(request);

  const { data: existingLog } = await admin
    .from("currency_logs")
    .select("id,balance_after,amount,memo")
    .eq("idempotency_key", parsed.data.idempotencyKey)
    .maybeSingle<ExistingLogRow>();
  if (existingLog) {
    return ok({ duplicate: true, balanceAfter: existingLog.balance_after, ticketsAdded: 0 }, 201);
  }

  const { data: rate, error: rateError } = await admin
    .from("ticket_exchange_rates")
    .select("id,draw_id,currency_id,currency_cost,ticket_quantity,is_active,deleted_at")
    .eq("id", parsed.data.rateId)
    .maybeSingle<RateRow>();
  if (rateError) return fail("교환 비율을 확인하지 못했습니다.", 400, "RATE_LOOKUP_FAILED", errorMessage(rateError, "rate lookup failed"));
  if (!rate || !rate.is_active || rate.deleted_at) return fail("사용 가능한 추첨권 교환 규칙이 없습니다.", 404, "RATE_NOT_FOUND");

  const [{ data: draw, error: drawError }, { data: currency, error: currencyError }, { data: balanceRow, error: balanceError }] = await Promise.all([
    admin.from("draws").select("id,name,status,is_public,deleted_at").eq("id", rate.draw_id).maybeSingle<DrawRow>(),
    admin.from("virtual_currencies").select("id,name,symbol,is_active,deleted_at").eq("id", rate.currency_id).maybeSingle<CurrencyRow>(),
    admin.from("currency_balances").select("profile_id,currency_id,balance").eq("profile_id", guard.auth.userId).eq("currency_id", rate.currency_id).maybeSingle<BalanceRow>(),
  ]);
  if (drawError) return fail("이벤트 정보를 확인하지 못했습니다.", 400, "DRAW_LOOKUP_FAILED", errorMessage(drawError, "draw lookup failed"));
  if (!draw || draw.deleted_at || !draw.is_public || draw.status !== "ACTIVE") return fail("진행 중인 공개 이벤트에서만 교환할 수 있습니다.", 409, "DRAW_NOT_ACTIVE");
  if (currencyError) return fail("화폐 정보를 확인하지 못했습니다.", 400, "CURRENCY_LOOKUP_FAILED", errorMessage(currencyError, "currency lookup failed"));
  if (!currency || !currency.is_active || currency.deleted_at) return fail("사용 가능한 화폐를 찾을 수 없습니다.", 404, "CURRENCY_NOT_AVAILABLE");
  if (balanceError && String(balanceError.code) !== "PGRST116") return fail("화폐 잔액을 확인하지 못했습니다.", 400, "BALANCE_LOOKUP_FAILED", errorMessage(balanceError, "balance lookup failed"));

  const bundleCount = parsed.data.bundleCount;
  const cost = rate.currency_cost * bundleCount;
  const ticketsAdded = rate.ticket_quantity * bundleCount;
  const beforeBalance = Number(balanceRow?.balance ?? 0);
  if (beforeBalance < cost) return fail(`보유 화폐가 부족합니다. 필요 ${cost.toLocaleString()}${currency.symbol}, 보유 ${beforeBalance.toLocaleString()}${currency.symbol}`, 409, "INSUFFICIENT_CURRENCY");
  const nextBalance = beforeBalance - cost;

  const { data: ticketRow } = await admin
    .from("draw_tickets")
    .select("profile_id,draw_id,quantity")
    .eq("profile_id", guard.auth.userId)
    .eq("draw_id", rate.draw_id)
    .maybeSingle<TicketRow>();
  const nextTickets = Number(ticketRow?.quantity ?? 0) + ticketsAdded;

  const [currencyUpdate, ticketUpdate] = await Promise.all([
    admin.from("currency_balances").upsert({ profile_id: guard.auth.userId, currency_id: rate.currency_id, balance: nextBalance, updated_at: new Date().toISOString() }, { onConflict: "profile_id,currency_id" }),
    admin.from("draw_tickets").upsert({ profile_id: guard.auth.userId, draw_id: rate.draw_id, quantity: nextTickets, updated_at: new Date().toISOString() }, { onConflict: "profile_id,draw_id" }),
  ]);
  if (currencyUpdate.error) return fail("화폐 차감에 실패했습니다.", 400, "CURRENCY_DEDUCT_FAILED", errorMessage(currencyUpdate.error, "currency update failed"));
  if (ticketUpdate.error) return fail("추첨권 지급에 실패했습니다.", 400, "TICKET_GRANT_FAILED", errorMessage(ticketUpdate.error, "ticket update failed"));

  await admin.from("currency_logs").insert({
    profile_id: guard.auth.userId,
    currency_id: rate.currency_id,
    amount: -cost,
    action: "USER_EXCHANGE_TO_TICKET",
    memo: `${draw.name} 추첨권 ${ticketsAdded.toLocaleString()}장 교환`,
    balance_after: nextBalance,
    idempotency_key: parsed.data.idempotencyKey,
    created_by: guard.auth.userId,
    ip_address: meta.ip,
    user_agent: meta.userAgent,
  });

  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "USER_EXCHANGED_CURRENCY_TO_TICKETS",
    p_target_table: "draw_tickets",
    p_target_id: guard.auth.userId,
    p_details: {
      profileId: guard.auth.userId,
      drawId: draw.id,
      drawName: draw.name,
      currencyId: currency.id,
      currencyName: currency.name,
      currencyCost: cost,
      ticketsAdded,
      bundleCount,
      balanceAfter: nextBalance,
      ticketBalanceAfter: nextTickets,
    },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok({
    duplicate: false,
    drawId: draw.id,
    drawName: draw.name,
    currencyId: currency.id,
    currencyName: currency.name,
    currencySpent: cost,
    balanceAfter: nextBalance,
    ticketsAdded,
    ticketBalanceAfter: nextTickets,
  }, 201);
}
