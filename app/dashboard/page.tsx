import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, ClipboardList, Gift, Ticket } from "lucide-react";
import { RecentResults } from "@/components/recent-results";
import { getPublicDashboardData } from "@/lib/data";

export const metadata: Metadata = { title: "공개 대시보드" };
export const dynamic = "force-dynamic";

export default async function PublicDashboardPage() {
  const { byDraw, recent, stats } = await getPublicDashboardData();
  return <main className="page public-dashboard-page dynamic-ink-page"><div className="container grid">
    <section className="dashboard-hero panel panel-pad ink-panel">
      <span className="section-kicker"><BarChart3 size={14} /> Public Dashboard</span>
      <h1>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 운영 대시보드</h1>
      <p>모든 뽑기와 추첨은 이벤트별로 따로 집계됩니다. 공개 가능한 누적 결과와 최근 기록을 한 화면에서 확인합니다.</p>
      <div className="dashboard-metrics"><div><strong>{stats.totalDraws.toLocaleString()}</strong><span>누적 추첨</span></div><div><strong>{stats.todayDraws.toLocaleString()}</strong><span>오늘 추첨</span></div><div><strong>{stats.totalMembers.toLocaleString()}</strong><span>승인 회원</span></div></div>
    </section>
    <section className="grid grid-2 draw-record-grid">
      {byDraw.length ? byDraw.map((draw) => <article className="panel panel-pad draw-record-card ink-panel" key={draw.drawId}>
        <div className="official-card-head"><div><span className="section-kicker"><Ticket size={13} /> Draw Record</span><h2>{draw.drawName}</h2></div><strong>{draw.total.toLocaleString()}회</strong></div>
        <div className="draw-record-bars">{draw.rewards.sort((a,b)=>b.count-a.count).map((reward) => <div key={reward.rewardId}><div className="bar-head"><span><Gift size={13} /> {reward.name}</span><b>{reward.count.toLocaleString()}</b></div><div className="mono-bar"><span style={{ width: `${Math.max(4, Math.round((reward.count / Math.max(draw.total, 1)) * 100))}%`, background: reward.color }} /></div></div>)}</div>
      </article>) : <div className="panel panel-pad empty"><ClipboardList size={24} /> 아직 공개 결과가 없습니다.</div>}
    </section>
    <section className="panel panel-pad ink-panel"><div className="official-card-head"><div><span className="section-kicker">Recent</span><h2>최근 공개 결과</h2></div><Link href="/results">전체 보기 <ArrowRight size={14} /></Link></div><RecentResults results={recent.slice(0, 12)} compact /></section>
  </div></main>;
}
