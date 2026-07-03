import type { Metadata } from "next";
import { UserRouletteDraw } from "@/components/user-roulette-draw";
import { requireApprovedUser } from "@/lib/auth";
import { getPlayableDraws, getUserCurrencyBalances, getUserDrawTickets, getUserTicketExchangeRates } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoMode } from "@/lib/env";

export const metadata: Metadata = { title: "직접 뽑기" };
export const dynamic = "force-dynamic";

async function getPlayCopy() {
  const fallback = {
    playHeroTitle: "내 추첨권으로 뽑기 & 교환하기",
    playHeroDescription: "",
    probabilityTitle: "상품 확률",
    probabilityDescription: "",
  };
  if (demoMode) return fallback;
  try {
    const { data } = await createAdminClient().from("site_settings").select("key,value").in("key", ["play_hero_title", "play_hero_description", "probability_title", "probability_description"]);
    for (const row of data ?? []) {
      const value = String(row.value ?? "").replace(/^"|"$/g, "");
      if (row.key === "play_hero_title" && value) fallback.playHeroTitle = value;
      if (row.key === "play_hero_description" && value) fallback.playHeroDescription = value;
      if (row.key === "probability_title" && value) fallback.probabilityTitle = value;
      if (row.key === "probability_description" && value) fallback.probabilityDescription = value;
    }
  } catch {}
  return fallback;
}

export default async function PlayPage() {
  const profile = await requireApprovedUser();
  const [draws, tickets, currencies, exchangeRates, copy] = await Promise.all([
    getPlayableDraws(profile.id),
    getUserDrawTickets(profile.id),
    getUserCurrencyBalances(profile.id),
    getUserTicketExchangeRates(),
    getPlayCopy(),
  ]);
  return <main className="page"><div className="container"><UserRouletteDraw draws={draws} tickets={tickets} currencies={currencies} exchangeRates={exchangeRates} copy={copy} /></div></main>;
}
