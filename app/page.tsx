import { ArrowRight, BarChart3, CheckCircle2, ClipboardList, Dices, Eye, LockKeyhole, Radio, ShieldCheck, Ticket, UsersRound } from "lucide-react";
import Link from "next/link";
import { LiveDrawStage } from "@/components/live-draw-stage";
import { MetricCard } from "@/components/metric-card";
import { RecentResults } from "@/components/recent-results";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { RewardCard } from "@/components/reward-card";
import { getActiveDraw, getPublicEvents, getPublicNotices, getPublicResults, getPublicSettings, getPublicStats } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [draw, results, stats, settings, notices, events] = await Promise.all([
    getActiveDraw(), getPublicResults(6), getPublicStats(), getPublicSettings(), getPublicNotices(3), getPublicEvents(3),
  ]);
  return (
    <main>
      <RealtimeRefresh />
      <section className="hero hero-clean">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow"><ShieldCheck size={14} /> EVENT OPERATIONS</span>
            <h1>{settings.heroTitle}</h1>
            <p className="hero-copy">{settings.heroDescription}</p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" href="/play"><Ticket size={18} /> 직접 뽑기</Link>
              <Link className="btn btn-secondary btn-lg" href="/events">이벤트 보기 <ArrowRight size={18} /></Link>
              <Link className="btn btn-secondary btn-lg" href="/notices">공지 확인</Link>
            </div>
            <div className="hero-trust"><span><CheckCircle2 size={14} /> 실제 결과는 서버에서 결정</span><span><CheckCircle2 size={14} /> 확률과 통계 공개</span><span><CheckCircle2 size={14} /> 개인정보 최소 수집</span></div>
          </div>
          <div className="hero-card-wrap" aria-hidden="true">
            <div className="operation-card panel panel-pad">
              <div className="operation-card-top"><span>Dynamic Draw</span><Dices size={22} /></div>
              <h2>이벤트 추첨 운영 대시보드</h2>
              <div className="operation-steps"><span>회원 승인</span><span>추첨권 지급</span><span>룰렛 추첨</span><span>결과 공개</span></div>
              <div className="operation-card-bottom"><strong>운영 기록 보존</strong><p>공지, 이벤트, 추첨권, 결과를 한 화면에서 관리합니다.</p></div>
            </div>
          </div>
        </div>
      </section>

      {settings.publicStats && <section className="section-tight">
        <div className="container grid grid-4">
          <MetricCard icon={<Dices size={20} />} label="누적 추첨" value={stats.totalDraws.toLocaleString()} note="공개된 유효 결과 기준" />
          <MetricCard icon={<BarChart3 size={20} />} label="오늘 추첨" value={stats.todayDraws.toLocaleString()} note="실시간 집계" />
          <MetricCard icon={<UsersRound size={20} />} label="승인 회원" value={stats.totalMembers.toLocaleString()} />
          <MetricCard icon={<Eye size={20} />} label="운영 방식" value="공개형" note="확률·결과·통계" />
        </div>
      </section>}

      <section className="section-tight">
        <div className="container grid grid-2">
          <section className="panel panel-pad"><div className="section-heading mini"><div><span className="eyebrow">NOTICE</span><h2>공지</h2></div><Link className="btn btn-secondary btn-sm" href="/notices">전체 보기</Link></div>{notices.length ? <div className="compact-list">{notices.map((notice) => <article key={notice.id}><strong>{notice.title}</strong><span>{formatDateTime(notice.created_at)}</span></article>)}</div> : <div className="empty">공개된 공지가 없습니다.</div>}</section>
          <section className="panel panel-pad"><div className="section-heading mini"><div><span className="eyebrow">EVENT</span><h2>이벤트</h2></div><Link className="btn btn-secondary btn-sm" href="/events">전체 보기</Link></div>{events.length ? <div className="compact-list">{events.map((event) => <article key={event.id}><strong>{event.title}</strong><span>{event.summary ?? (event.status === "ACTIVE" ? "진행 중" : "안내")}</span></article>)}</div> : <div className="empty">공개된 이벤트가 없습니다.</div>}</section>
        </div>
      </section>

      {draw && (
        <section className="section">
          <div className="container">
            <div className="section-heading"><div><span className="eyebrow">CURRENT DRAW</span><h2>{draw.name}</h2><p>{draw.description}</p></div><Link className="btn btn-secondary" href="/probabilities">전체 확률표 <ArrowRight size={16} /></Link></div>
            <div className="grid grid-4">{(draw.rewards ?? []).filter((reward) => reward.is_active).map((reward) => <RewardCard key={reward.id} reward={reward} />)}</div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container grid grid-2">
          <div><div className="section-heading"><div><span className="eyebrow">LIVE STAGE</span><h2>실시간 추첨 현황</h2><p>추첨 연출과 결과 공개를 실시간으로 확인합니다.</p></div></div><LiveDrawStage drawId={draw?.id} initialResult={results[0] ?? null} draw={draw} /></div>
          <div><div className="section-heading"><div><span className="eyebrow">RECENT RESULTS</span><h2>최근 공개 결과</h2><p>회원 정보는 가리고 결과만 투명하게 공개합니다.</p></div></div><div className="panel panel-pad"><RecentResults results={results} compact /></div></div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading"><div><span className="eyebrow">TRUST BY DESIGN</span><h2>운영 신뢰를 위한 기본 구조</h2><p>룰렛 화면은 연출이고, 결과는 서버에서 먼저 확정됩니다.</p></div></div>
          <div className="grid grid-3">
            <article className="panel panel-pad"><div className="metric-icon"><LockKeyhole size={21} /></div><h3>서버·DB 추첨</h3><p className="panel-description">브라우저는 결과를 고르지 않습니다. DB 트랜잭션으로 결과와 보유 수량을 함께 처리합니다.</p></article>
            <article className="panel panel-pad"><div className="metric-icon"><ClipboardList size={21} /></div><h3>공지·이벤트 운영</h3><p className="panel-description">추첨 안내, 이벤트 기간, 지급 기준을 별도 페이지로 공개해 운영 흐름을 명확히 보여줍니다.</p></article>
            <article className="panel panel-pad"><div className="metric-icon"><Radio size={21} /></div><h3>실시간 결과 공개</h3><p className="panel-description">관리자 추첨과 회원 직접 뽑기를 모두 실시간 기록과 통계에 반영합니다.</p></article>
          </div>
        </div>
      </section>
    </main>
  );
}
