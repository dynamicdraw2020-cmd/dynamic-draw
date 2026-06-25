import type { Metadata } from "next";
import { StatsCharts } from "@/components/stats-charts";
import { requireAdmin } from "@/lib/auth";
import { getAdminStats } from "@/lib/data";

export const metadata: Metadata = { title: "관리자 통계" };

export default async function AdminStatsPage() {
  await requireAdmin("VIEWER");
  const stats = await getAdminStats();
  return <><div className="admin-toolbar"><div><h1>통계</h1><p className="text-muted">공개 통계와 동일한 기준으로 설정 확률과 실제 출현율을 비교합니다.</p></div></div><StatsCharts stats={stats} /></>;
}
