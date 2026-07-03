import type { Metadata } from "next";
import { Activity, Dices, UsersRound } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { StatsCharts } from "@/components/stats-charts";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getPublicSettings, getPublicStats } from "@/lib/data";

export const metadata: Metadata = { title: "누적 통계" };
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const [stats, settings] = await Promise.all([getPublicStats(), getPublicSettings()]);
  if (!settings.publicStats) {
    return <main className="page"><RealtimeRefresh /><div className="container"><div className="page-heading"><h1>누적 운영 통계</h1><p>현재 운영자가 공개 통계를 잠시 숨긴 상태입니다.</p></div><div className="panel panel-pad empty">확률표와 최근 공개 결과는 계속 확인할 수 있습니다.</div></div></main>;
  }
  return <main className="page"><RealtimeRefresh /><div className="container"><div className="page-heading"><h1>누적 운영 통계</h1><p>설정 확률과 실제 결과의 차이를 공개 데이터로 확인합니다.</p></div><div className="grid grid-3"><MetricCard icon={<Dices size={20} />} label="총 추첨 수" value={stats.totalDraws.toLocaleString()} /><MetricCard icon={<Activity size={20} />} label="오늘 추첨" value={stats.todayDraws.toLocaleString()} /><MetricCard icon={<UsersRound size={20} />} label="승인 회원" value={stats.totalMembers.toLocaleString()} /></div><div className="mt-3"><StatsCharts stats={stats} /></div></div></main>;
}
