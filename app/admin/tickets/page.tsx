import type { Metadata } from "next";
import { TicketGrantManager } from "@/components/ticket-grant-manager";
import { requireAdmin } from "@/lib/auth";
import { getAdminCurrencyBalances, getAdminDraws, getAdminMembers, getAdminTicketBalances, getAdminTicketExchangeRates, getVirtualCurrencies } from "@/lib/data";

export const metadata: Metadata = { title: "추첨권·화폐" };
export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  await requireAdmin("MANAGER");
  const [draws, members, balances, currencies, currencyBalances, exchangeRates] = await Promise.all([
    getAdminDraws(), getAdminMembers(), getAdminTicketBalances(), getVirtualCurrencies(), getAdminCurrencyBalances(), getAdminTicketExchangeRates(),
  ]);
  return <><div className="admin-toolbar"><div><h1>추첨권·화폐 시스템</h1><p className="text-muted">뽑기에 사용할 추첨권을 지급하고, 이벤트 화폐를 만들어 회원이 추첨권으로 교환할 수 있게 합니다.</p></div></div><TicketGrantManager draws={draws} members={members} balances={balances} currencies={currencies} currencyBalances={currencyBalances} exchangeRates={exchangeRates} /></>;
}
