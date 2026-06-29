import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Medal, Sparkles, Trophy, Zap } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { getPublicRankings, type PublicRankingEntry } from "@/lib/data";

export const metadata: Metadata = { title: "순위" };
export const dynamic = "force-dynamic";

type RankingSectionProps = {
  title: string;
  description: string;
  metricLabel: string;
  metric: (entry: PublicRankingEntry) => string;
  entries: PublicRankingEntry[];
  icon: ReactNode;
};

function maskedUserLine(entry: PublicRankingEntry) {
  return entry.profileId ? "아이디 비공개" : "";
}

function RankingSection({ title, description, metricLabel, metric, entries, icon, currentProfileId }: RankingSectionProps & { currentProfileId?: string | null }) {
  const sorted = entries;
  const topTen = sorted.slice(0, 10);
  const ownIndex = currentProfileId ? sorted.findIndex((entry) => entry.profileId === currentProfileId) : -1;
  const ownEntry = ownIndex >= 0 ? sorted[ownIndex] : null;

  return <section className="public-card ranking-card">
    <div className="ranking-head">
      <div className="ranking-icon">{icon}</div>
      <div><h2>{title}</h2><p>{description}</p></div>
    </div>
    <div className="ranking-list">
      {topTen.length ? topTen.map((entry, index) => <article className="ranking-row" key={`${title}-${entry.profileId}`}>
        <div className={`ranking-place place-${index + 1}`}>{index + 1}</div>
        <div className="ranking-user">
          <strong>{entry.displayName}</strong>
          <span>{maskedUserLine(entry)}</span>
          {entry.badges.length > 0 && <div className="ranking-badges">{entry.badges.map((badge) => <em key={badge.name} style={{ borderColor: badge.labelColor ?? undefined }}>{badge.icon ?? "🏅"} {badge.name}</em>)}</div>}
        </div>
        <div className="ranking-metric"><small>{metricLabel}</small><b>{metric(entry)}</b></div>
      </article>) : <div className="empty-light">아직 순위 데이터가 없습니다.</div>}
    </div>
    {ownEntry && <div className="ranking-own-row">
      <strong>내 순위</strong>
      <span>{ownIndex + 1}위 · {ownEntry.displayName}</span>
      <b>{metric(ownEntry)}</b>
    </div>}
  </section>;
}

export default async function RankingsPage() {
  const [rankings, profile] = await Promise.all([getPublicRankings(), getCurrentProfile()]);
  return <main className="page public-subpage ranking-page">
    <div className="container">
      <div className="public-page-heading ranking-title-block">
        <span className="section-kicker"><Trophy size={14} /> Ranking</span>
        <h1>순위</h1>
        <p>레벨, 경험치 획득, 주간 추첨 시도 순위를 확인합니다.</p>
      </div>
      <div className="ranking-grid">
        <RankingSection title="레벨 순위" description="현재 레벨과 누적 EXP 기준으로 정렬됩니다." metricLabel="레벨 / EXP" metric={(entry) => `Lv.${entry.levelNo} · ${entry.expTotal.toLocaleString()} EXP`} entries={rankings.level} icon={<Medal size={22} />} currentProfileId={profile?.id} />
        <RankingSection title="경험치 획득 순위" description="누적 양수 EXP 로그 기준으로 정렬됩니다." metricLabel="획득 EXP" metric={(entry) => `${entry.gainedExp.toLocaleString()} EXP`} entries={rankings.exp} icon={<Sparkles size={22} />} currentProfileId={profile?.id} />
        <RankingSection title="주간 추첨 시도 순위" description="최근 7일간 공개 유효 결과 기준으로 정렬됩니다." metricLabel="최근 7일" metric={(entry) => `${entry.weeklyDraws.toLocaleString()}회`} entries={rankings.weeklyDraws} icon={<Zap size={22} />} currentProfileId={profile?.id} />
      </div>
    </div>
  </main>;
}
