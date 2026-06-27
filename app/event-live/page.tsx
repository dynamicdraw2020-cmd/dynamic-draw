import type { Metadata } from "next";
import { LiveDrawStage } from "@/components/live-draw-stage";
import { PublicClawRaffle } from "@/components/claw-raffle-stage";
import { getActiveDraw, getPublicRaffles, getPublicResults } from "@/lib/data";

export const metadata: Metadata = { title: "이벤트 라이브" };
export const dynamic = "force-dynamic";

export default async function EventLivePage() {
  const [draw, results, raffles] = await Promise.all([getActiveDraw(), getPublicResults(1), getPublicRaffles(3)]);
  return <main className="page event-live-page dynamic-ink-page"><div className="container grid">
    <section className="page-heading live-heading"><span className="section-kicker">EVENT LIVE</span><h1>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 라이브 송출 화면</h1><p>OBS 브라우저 소스, 디스코드 화면 공유, 모바일 라이브에 맞춘 이벤트용 화면입니다.</p></section>
    <LiveDrawStage drawId={draw?.id} initialResult={results[0] ?? null} draw={draw} />
    <PublicClawRaffle raffles={raffles} />
  </div></main>;
}
