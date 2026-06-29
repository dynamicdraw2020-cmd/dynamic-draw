import type { Metadata } from "next";
import { StatsCharts } from "@/components/stats-charts";
import { requireAdmin } from "@/lib/auth";
import { getAdminStats } from "@/lib/data";

export const metadata: Metadata = { title: "관리자 통계" };

export default async function AdminStatsPage() {
  await requireAdmin("VIEWER");
  const stats = await getAdminStats();
  return <>
    <div className="admin-toolbar">
      <div>
        <h1>통계</h1>
        <p className="text-muted">전체 통계와 뽑기별 통계를 선택해서 확인합니다. 모바일에서도 핵심 지표가 먼저 보이도록 정리했습니다.</p>
      </div>
    </div>
    <StatsCharts stats={stats} />
  </>;
}
