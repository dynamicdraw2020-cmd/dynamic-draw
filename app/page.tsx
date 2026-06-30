import { ArrowRight, CheckCircle2, ExternalLink, MessageSquare, Megaphone, ShieldCheck, Star, Ticket, Trophy, UsersRound } from "lucide-react";
import Link from "next/link";
import { HomeRecentResultsFilter } from "@/components/home-recent-results-filter";
import { PublicGachaRaffle } from "@/components/public-gacha-raffle";
import { PublicEventBoard } from "@/components/public-event-board";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getPublicEvents, getPublicNotices, getPublicRaffles, getPublicRankings, getPublicResults } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

const officialLinks = [
  { label: "공식 디스코드", href: "https://discord.gg/Q2j3uZADft" },
  { label: "공식 오픈채팅", href: "https://open.kakao.com/o/s8p7BvBi" },
  { label: "문의센터", href: "/support", text: "홈페이지 문의센터" },
];

async function homeSetting(key: string, fallback = "") {
  if (demoMode) return fallback;
  try {
    const { data } = await createAdminClient().from("site_settings").select("value").eq("key", key).maybeSingle();
    return String((data as { value?: unknown } | null)?.value ?? "").replace(/^"|"$/g, "") || fallback;
  } catch { return fallback; }
}

export default async function HomePage() {
  const [results, notices, events, raffles, rankings, monthlyRankImageUrl, footerMessage] = await Promise.all([
    getPublicResults(24),
    getPublicNotices(5),
    getPublicEvents(6),
    getPublicRaffles(4),
    getPublicRankings(),
    homeSetting("monthly_rank_image_url"),
    homeSetting("footer_message", "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃는 온전한 이벤트 홈페이지로서 현금, 현물 등을 요구하지 않습니다."),
  ]);
  const pinnedNotice = notices.find((notice) => notice.is_pinned) ?? notices[0] ?? null;

  return <main className="public-home community-home mobile-public-home"><RealtimeRefresh />
    {pinnedNotice && <section className="top-notice-banner"><div className="container top-notice-inner"><Megaphone size={17} /><strong>{pinnedNotice.title}</strong><span>{pinnedNotice.body}</span><Link href="/notices">자세히 <ArrowRight size={14} /></Link></div></section>}

    <section className="community-hero"><div className="container community-hero-grid"><div className="community-copy"><span className="section-kicker"><ShieldCheck size={14} /> Official 𝐃𝐲𝐧𝐚𝐦𝐢𝐜 Event</span><h1>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃</h1><p className="official-lead">𝐃𝐲𝐧𝐚𝐦𝐢𝐜 Event server</p><p className="official-sublead">𝐃𝐲𝐧𝐚𝐦𝐢𝐜 제공</p><div className="official-actions"><Link className="btn btn-primary btn-lg" href="/notices"><Megaphone size={18} /> 공지</Link><Link className="btn btn-secondary btn-lg" href="/events"><Ticket size={18} /> 이벤트</Link><Link className="btn btn-secondary btn-lg" href="/rewards"><UsersRound size={18} /> 보상 센터</Link></div><div className="safe-service-note"><CheckCircle2 size={16} /> 𝐃𝐲𝐧𝐚𝐦𝐢𝐜에서 제공하는 이벤트 서버입니다.</div></div><aside className="official-contact-card clean-contact-card"><h2>공식 채널</h2><p>공지, 참여 안내, 문의는 아래 공식 채널을 기준으로 운영됩니다.</p><div className="official-link-list">{officialLinks.map((item) => <a key={item.label} href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel={item.href.startsWith("http") ? "noreferrer" : undefined}><span>{item.label}</span><strong>{item.text ?? item.href}</strong><ExternalLink size={15} /></a>)}</div></aside></div></section>

    <section className="official-section first-info-section"><div className="container"><PublicEventBoard events={events} notices={notices} /></div></section>

    <section className="official-section compact-official-section"><div className="container"><div className="public-card ranking-top-strip rank-month-card"><div><span className="section-kicker"><Trophy size={14} /> Ranking Top</span><h2>분야별 1위</h2><p className="panel-description">매월 랭킹 이미지는 관리자 설정에서 바꿀 수 있습니다.</p></div>{monthlyRankImageUrl && <img className="rank-month-image" src={monthlyRankImageUrl} alt="월간 랭킹 이미지" />}<div className="ranking-top-grid"><Link href="/rankings"><strong>레벨 1위</strong><span>{rankings.level[0]?.displayName ?? "집계 없음"}</span></Link><Link href="/rankings"><strong>출석 1위</strong><span>{rankings.attendance[0]?.displayName ?? "집계 없음"}</span></Link><Link href="/rankings"><strong>주간 뽑기 1위</strong><span>{rankings.weeklyDraws[0]?.displayName ?? "집계 없음"}</span></Link></div></div></div></section>

    <section className="official-section compact-official-section"><div className="container public-gateway-grid"><Link className="public-card gateway-card" href="/community"><MessageSquare size={24} /><div><span className="section-kicker">Community</span><h2>커뮤니티</h2><p>닉네임으로 이벤트 이야기를 나눌 수 있습니다. 등급 조건이 있으면 해당 등급부터 이용 가능합니다.</p></div><ArrowRight size={18} /></Link><Link className="public-card gateway-card" href="/reviews"><Star size={24} /><div><span className="section-kicker">Winner Review</span><h2>당첨 후기</h2><p>승인된 당첨 후기를 모아 볼 수 있습니다.</p></div><ArrowRight size={18} /></Link><Link className="public-card gateway-card" href="/rankings"><UsersRound size={24} /><div><span className="section-kicker">Ranking</span><h2>랭킹</h2><p>레벨, 경험치 획득, 주간 뽑기 순위를 확인합니다.</p></div><ArrowRight size={18} /></Link></div></section>

    <section className="official-section"><div className="container"><PublicGachaRaffle raffles={raffles} /></div></section>

    <section className="official-section compact-official-section"><div className="container"><HomeRecentResultsFilter results={results} /></div></section>

    <section className="official-section compact-official-section"><div className="container public-card policy-card"><ShieldCheck size={22} /><div><h2>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃</h2><p>{footerMessage}</p></div></div></section>
  </main>;
}
