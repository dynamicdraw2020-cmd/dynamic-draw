import { Activity, ArrowRight, BarChart3, CheckCircle2, Dices, Eye, LockKeyhole, Radio, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import Link from "next/link";
import { LiveDrawStage } from "@/components/live-draw-stage";
import { MetricCard } from "@/components/metric-card";
import { RecentResults } from "@/components/recent-results";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { RewardCard } from "@/components/reward-card";
import { getActiveDraw, getPublicResults, getPublicSettings, getPublicStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [draw, results, stats, settings] = await Promise.all([getActiveDraw(), getPublicResults(6), getPublicStats(), getPublicSettings()]);
  const titleParts = settings.heroTitle.split(",");
  return (
    <main>
      <RealtimeRefresh />
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow"><span className="live-dot" /> REAL-TIME EVENT DRAW</span>
            <h1>{titleParts[0]}{titleParts.length > 1 && <>,<br /><em>{titleParts.slice(1).join(",").trim()}</em></>}</h1>
            <p className="hero-copy">{settings.heroDescription}</p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" href="/live"><Radio size={18} /> 실시간 추첨 보기</Link>
              <Link className="btn btn-secondary btn-lg" href="/signup">회원가입 신청 <ArrowRight size={18} /></Link>
            </div>
            <div className="hero-trust"><span><CheckCircle2 size={14} /> 서버 측 결과 결정</span><span><CheckCircle2 size={14} /> 확률 100% 자동 검증</span><span><CheckCircle2 size={14} /> 변경 기록 영구 보존</span></div>
          </div>
          <div className="hero-card-wrap" aria-hidden="true">
            <div className="orbit" />
            <div className="hero-card"><div className="hero-card-inner"><div className="card-logo"><span>Dynamic Draw</span><Sparkles size={18} /></div><div className="card-symbol"><Dices size={72} /></div><div className="card-bottom"><strong>WHAT&apos;S NEXT?</strong><p>Flip the moment. Trust the result.</p></div></div></div>
          </div>
        </div>
      </section>

      {settings.publicStats && <section className="section-tight">
        <div className="container grid grid-4">
          <MetricCard icon={<Dices size={20} />} label="누적 추첨" value={stats.totalDraws.toLocaleString()} note="공개된 유효 결과 기준" />
          <MetricCard icon={<Activity size={20} />} label="오늘 추첨" value={stats.todayDraws.toLocaleString()} note="실시간 자동 갱신" />
          <MetricCard icon={<UsersRound size={20} />} label="승인 회원" value={stats.totalMembers.toLocaleString()} />
          <MetricCard icon={<Eye size={20} />} label="운영 방식" value="100% 공개" note="확률·기록·통계" />
        </div>
      </section>}

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
          <div><div className="section-heading"><div><span className="eyebrow">LIVE STAGE</span><h2>지금 이 순간의 추첨</h2><p>관리자가 추첨을 실행하면 모든 접속 화면에서 같은 연출과 결과를 확인합니다.</p></div></div><LiveDrawStage drawId={draw?.id} initialResult={results[0] ?? null} /></div>
          <div><div className="section-heading"><div><span className="eyebrow">RECENT RESULTS</span><h2>최근 공개 결과</h2><p>개인정보는 가리고 결과는 투명하게 보여줍니다.</p></div></div><div className="panel panel-pad"><RecentResults results={results} compact /></div></div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading"><div><span className="eyebrow">TRUST BY DESIGN</span><h2>처음부터 조작하기 어렵게</h2><p>화려한 카드 연출과 결과 결정은 완전히 분리되어 있습니다.</p></div></div>
          <div className="grid grid-3">
            <article className="panel panel-pad"><div className="metric-icon"><LockKeyhole size={21} /></div><h3>서버·DB 추첨</h3><p className="panel-description">브라우저는 결과를 고르지 않습니다. 보안 난수와 DB 트랜잭션으로 결과를 먼저 확정합니다.</p></article>
            <article className="panel panel-pad"><div className="metric-icon"><ShieldCheck size={21} /></div><h3>변경 이력 보존</h3><p className="panel-description">확률 변경 전후 값, 관리자, 사유, 시각을 기록하며 수정·삭제를 차단합니다.</p></article>
            <article className="panel panel-pad"><div className="metric-icon"><BarChart3 size={21} /></div><h3>실제 출현율 공개</h3><p className="panel-description">설정 확률과 누적 실제 출현율을 나란히 표시해 운영 상태를 누구나 확인할 수 있습니다.</p></article>
          </div>
        </div>
      </section>
    </main>
  );
}
