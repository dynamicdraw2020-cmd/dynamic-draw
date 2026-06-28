import type { Metadata } from "next";
import { UserRouletteDraw } from "@/components/user-roulette-draw";
import { requireApprovedUser } from "@/lib/auth";
import { getPlayableDraws, getUserCurrencyBalances, getUserDrawTickets, getUserTicketExchangeRates } from "@/lib/data";

export const metadata: Metadata = { title: "직접 뽑기" };
export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const profile = await requireApprovedUser();
  const [draws, tickets, currencies, exchangeRates] = await Promise.all([
    getPlayableDraws(),
    getUserDrawTickets(profile.id),
    getUserCurrencyBalances(profile.id),
    getUserTicketExchangeRates(),
  ]);
  return <main className="page"><div className="container"><UserRouletteDraw draws={draws} tickets={tickets} currencies={currencies} exchangeRates={exchangeRates} /></div></main>;
}
