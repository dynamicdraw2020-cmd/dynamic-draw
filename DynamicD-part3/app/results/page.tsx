import type { Metadata } from "next";
import { RecentResults } from "@/components/recent-results";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getPublicResults } from "@/lib/data";

export const metadata: Metadata = { title: "최근 당첨 내역" };
export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const results = await getPublicResults(100);
  return <main className="page"><RealtimeRefresh /><div className="container"><div className="page-heading"><h1>최근 당첨 내역</h1><p>공개가 완료되고 무효 처리되지 않은 결과만 표시합니다. 이름과 고유 ID 일부는 가려집니다.</p></div><section className="panel panel-pad"><RecentResults results={results} /></section></div></main>;
}
