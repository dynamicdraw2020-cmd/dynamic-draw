import type { Metadata } from "next";
import { CsGrantManager } from "@/components/cs-grant-manager";
import { TicketGrantManager } from "@/components/ticket-grant-manager";
import { requireAdminCapability } from "@/lib/auth";
import {
  getAdminCurrencyBalances,
  getAdminDraws,
  getAdminMembers,
  getAdminTicketBalances,
  getAdminTicketExchangeRates,
  getVirtualCurrencies,
} from "@/lib/data";

export const metadata: Metadata = { title: "추첨권·포인트" };
export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  const profile = await requireAdminCapability("GRANT_REWARD");
  const [draws, members, balances, currencies, currencyBalances, exchangeRates] = await Promise.all([
    getAdminDraws(),
    getAdminMembers(),
    getAdminTicketBalances(),
    getVirtualCurrencies(),
    getAdminCurrencyBalances(),
    getAdminTicketExchangeRates(),
  ]);

  return (
    <>
      <section className="hero-card compact">
        <div>
          <p className="eyebrow">운영 지급</p>
          <h1>{String(profile.role) === "CS_MANAGER" ? "CS 지급 콘솔" : "추첨권·화폐 관리"}</h1>
          <p>
            {String(profile.role) === "CS_MANAGER"
              ? "승인된 회원 1명에게 추첨권과 포인트를 지급합니다."
              : "추첨권 지급, 전체 지급, 운영용 화폐 설정, 화폐→추첨권 교환 비율을 관리합니다."}
          </p>
        </div>
      </section>

      {String(profile.role) === "CS_MANAGER" ? (
        <CsGrantManager
          draws={draws}
          members={members}
          balances={balances}
          currencies={currencies}
          currencyBalances={currencyBalances}
        />
      ) : (
        <TicketGrantManager
          draws={draws}
          members={members}
          balances={balances}
          currencies={currencies}
          currencyBalances={currencyBalances}
          exchangeRates={exchangeRates}
        />
      )}
    </>
  );
}
