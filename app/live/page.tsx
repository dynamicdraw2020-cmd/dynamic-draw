import type { Metadata } from "next";
import { LiveDrawStage } from "@/components/live-draw-stage";
import { RecentResults } from "@/components/recent-results";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getActiveDraw, getPublicResults } from "@/lib/data";

export const metadata: Metadata = { title: "실시간 결과" };
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const [draw, results] = await Promise.all([getActiveDraw(), getPublicResults(12)]);
  return <main className="page"><RealtimeRefresh /><div className="container"><div className="page-heading"><span className="eyebrow"><span className="live-dot" /> LIVE</span><h1>실시간 추첨 현장</h1><p>새로고침 없이 추첨 시작, 카드 연출, 결과 공개를 함께 봅니다.</p></div><div className="grid grid-2"><LiveDrawStage drawId={draw?.id} initialResult={results[0] ?? null} draw={draw} /><section className="panel panel-pad"><h2 className="panel-title">최근 공개 기록</h2><p className="panel-description">무효 처리된 결과는 통계와 목록에서 제외됩니다.</p><div className="mt-3"><RecentResults results={results} compact /></div></section></div></div></main>;
}
