import type { Metadata } from "next";
import { CsGrantManager } from "@/components/cs-grant-manager";
import { TicketGrantManager } from "@/components/ticket-grant-manager";
import { hasMinimumRole } from "@/lib/admin-capabilities";
import { requireAdminCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminCurrencyBalance, AdminTicketBalance, Draw, Profile, TicketExchangeRate, VirtualCurrency } from "@/lib/types";

export const metadata: Metadata = { title: "추첨권·화폐" };
export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

type RawTicketBalance = { profile_id: string; draw_id: string; quantity: number; updated_at: string | null };
type RawCurrencyBalance = { profile_id: string; currency_id: string; balance: number; updated_at: string | null };
type RawExchangeRate = TicketExchangeRate & { deleted_at?: string | null };

async function safeList<T>(promise: Promise<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await promise;
    if (error || !Array.isArray(data)) return [];
    return data as T[];
  } catch {
    return [];
  }
}

async function loadTicketPageData(admin: AdminClient) {
  const [draws, members, rawBalances, currencies, rawCurrencyBalances, rawExchangeRates] = await Promise.all([
    safeList<Draw>(
      admin
        .from("draws")
        .select("id,name,slug,description,status,animation_ms,is_public,created_at,deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }) as unknown as Promise<{ data: unknown; error: unknown }>,
    ),
    safeList<Profile>(admin.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000) as unknown as Promise<{ data: unknown; error: unknown }>),
    safeList<RawTicketBalance>(
      admin
        .from("draw_tickets")
        .select("profile_id,draw_id,quantity,updated_at")
        .order("updated_at", { ascending: false })
        .limit(2000) as unknown as Promise<{ data: unknown; error: unknown }>,
    ),
    safeList<VirtualCurrency>(
      admin
        .from("virtual_currencies")
        .select("id,name,code,symbol,is_active,sort_order,deleted_at")
        .order("sort_order", { ascending: true }) as unknown as Promise<{ data: unknown; error: unknown }>,
    ),
    safeList<RawCurrencyBalance>(
      admin
        .from("currency_balances")
        .select("profile_id,currency_id,balance,updated_at")
        .order("updated_at", { ascending: false })
        .limit(2000) as unknown as Promise<{ data: unknown; error: unknown }>,
    ),
    safeList<RawExchangeRate>(
      admin
        .from("ticket_exchange_rates")
        .select("id,draw_id,currency_id,currency_cost,ticket_quantity,is_active,sort_order,deleted_at")
        .order("sort_order", { ascending: true }) as unknown as Promise<{ data: unknown; error: unknown }>,
    ),
  ]);

  const profileMap = new Map(members.map((member) => [member.id, member]));
  const drawMap = new Map(draws.map((draw) => [draw.id, draw]));
  const currencyMap = new Map(currencies.map((currency) => [currency.id, currency]));

  const balances: AdminTicketBalance[] = rawBalances
    .map((balance) => {
      const profile = profileMap.get(balance.profile_id);
      const draw = drawMap.get(balance.draw_id);
      if (!profile || !draw) return null;
      return {
        profile_id: balance.profile_id,
        draw_id: balance.draw_id,
        quantity: Number(balance.quantity ?? 0),
        profile_name: profile.display_name,
        profile_email: profile.email,
        profile_username: profile.username ?? null,
        member_code: profile.member_code,
        draw_name: draw.name,
        updated_at: balance.updated_at,
      } satisfies AdminTicketBalance;
    })
    .filter((item): item is AdminTicketBalance => Boolean(item));

  const currencyBalances: AdminCurrencyBalance[] = rawCurrencyBalances
    .map((balance) => {
      const profile = profileMap.get(balance.profile_id);
      const currency = currencyMap.get(balance.currency_id);
      if (!profile || !currency) return null;
      return {
        profile_id: balance.profile_id,
        currency_id: balance.currency_id,
        balance: Number(balance.balance ?? 0),
        profile_name: profile.display_name,
        profile_email: profile.email,
        profile_username: profile.username ?? null,
        member_code: profile.member_code,
        currency_name: currency.name,
        currency_symbol: currency.symbol,
        updated_at: balance.updated_at,
      } satisfies AdminCurrencyBalance;
    })
    .filter((item): item is AdminCurrencyBalance => Boolean(item));

  const exchangeRates = rawExchangeRates
    .filter((rate) => !rate.deleted_at)
    .map((rate) => {
      const draw = drawMap.get(rate.draw_id);
      const currency = currencyMap.get(rate.currency_id);
      return {
        ...rate,
        draw_name: draw?.name ?? rate.draw_id,
        currency_name: currency?.name ?? rate.currency_id,
        currency_symbol: currency?.symbol ?? "",
      };
    });

  return { draws, members, balances, currencies, currencyBalances, exchangeRates };
}

export default async function AdminTicketsPage() {
  const profile = await requireAdminCapability("GRANT_REWARD");
  const admin = createAdminClient();
  const data = await loadTicketPageData(admin);
  const fullManager = hasMinimumRole(profile.role, "MANAGER");

  return (
    <>
      <section className="hero-card compact">
        <div>
          <p className="eyebrow">Reward Center</p>
          <h1>{fullManager ? "추첨권·화폐 관리" : "CS 보상 지급"}</h1>
          <p>
            {fullManager
              ? "추첨권 지급, 전체 지급, 운영용 화폐 설정, 화폐→추첨권 교환 비율을 관리합니다."
              : "CS매니저는 승인 회원 1명에게만 추첨권과 포인트를 지급할 수 있습니다."}
          </p>
        </div>
      </section>

      {fullManager ? (
        <TicketGrantManager
          draws={data.draws}
          members={data.members}
          balances={data.balances}
          currencies={data.currencies}
          currencyBalances={data.currencyBalances}
          exchangeRates={data.exchangeRates}
        />
      ) : (
        <CsGrantManager
          draws={data.draws}
          members={data.members}
          balances={data.balances}
          currencies={data.currencies}
          currencyBalances={data.currencyBalances}
        />
      )}
    </>
  );
}
