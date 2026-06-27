import type { Metadata } from "next";
import { LiveDrawStage } from "@/components/live-draw-stage";
import { PublicClawRaffle } from "@/components/claw-raffle-stage";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getActiveDraw, getPublicRaffles, getPublicResults } from "@/lib/data";

export const metadata: Metadata = { title: "이벤트 라이브" };
export const dynamic = "force-dynamic";

export default async function EventLivePage() {
  const [draw, results, raffles] = await Promise.all([getActiveDraw(), getPublicResults(1), getPublicRaffles(3)]);
  return <main className="page event-live-page dynamic-ink-page"><RealtimeRefresh eventTypes={["DRAW_START", "DRAW_ANIMATING", "DRAW_RESULT", "STATS_UPDATE"]} /><div className="container grid">
    <section className="page-heading live-heading"><span className="section-kicker">EVENT LIVE</span><h1>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 이벤트 라이브</h1><p>실시간 추첨과 전체 추첨 이벤트 결과를 한 화면에서 확인합니다.</p></section>
    <LiveDrawStage initialResult={results[0] ?? null} draw={draw} />
    <PublicClawRaffle raffles={raffles} />
  </div></main>;
}
