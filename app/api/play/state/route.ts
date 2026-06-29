import { fail, ok, requireApiUser } from "@/lib/api";
import { getPlayableDraws, getUserCurrencyBalances, getUserDrawTickets, getUserTicketExchangeRates } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  try {
    const [draws, tickets, currencies, exchangeRates] = await Promise.all([
      getPlayableDraws(guard.auth.userId),
      getUserDrawTickets(guard.auth.userId),
      getUserCurrencyBalances(guard.auth.userId),
      getUserTicketExchangeRates(),
    ]);

    return ok({ draws, tickets, currencies, exchangeRates, generatedAt: new Date().toISOString() });
  } catch (error) {
    return fail("직접 참여 정보를 불러오지 못했습니다.", 500, "PLAY_STATE_FAILED", error instanceof Error ? error.message : "unknown");
  }
}
