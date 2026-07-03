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
  return <><div className="admin-toolbar"><div><h1>추첨권·화폐 관리</h1><p className="text-muted">추첨권 지급, 전체 지급, 운영용 화폐 설정, 화폐→추첨권 교환 비율을 관리합니다.</p></div></div><TicketGrantManager draws={draws} members={members} balances={balances} currencies={currencies} currencyBalances={currencyBalances} exchangeRates={exchangeRates} /></>;
}
