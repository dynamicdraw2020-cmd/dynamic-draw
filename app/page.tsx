import { ArrowRight, CheckCircle2, ExternalLink, Megaphone, Radio, ShieldCheck, Ticket, UsersRound } from "lucide-react";
import Link from "next/link";
import { PublicClawRaffle } from "@/components/claw-raffle-stage";
import { PublicEventBoard } from "@/components/public-event-board";
import { RecentResults } from "@/components/recent-results";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getPublicEvents, getPublicNotices, getPublicRaffles, getPublicResults } from "@/lib/data";

export const dynamic = "force-dynamic";

const officialLinks = [
  { label: "공식 디스코드", href: "https://discord.gg/Q2j3uZADft" },
  { label: "공식 오픈채팅", href: "https://open.kakao.com/o/s8p7BvBi" },
  { label: "공식 1:1 문의", href: "#", text: "@dynamic__d (디스코드)" },
];

export default async function HomePage() {
  const [results, notices, events, raffles] = await Promise.all([
    getPublicResults(5),
    getPublicNotices(5),
    getPublicEvents(6),
    getPublicRaffles(4),
  ]);
  const pinnedNotice = notices.find((notice) => notice.is_pinned) ?? notices[0] ?? null;

  return <main className="public-home community-home"><RealtimeRefresh />
    {pinnedNotice && <section className="top-notice-banner"><div className="container top-notice-inner"><Megaphone size={17} /><strong>{pinnedNotice.title}</strong><span>{pinnedNotice.body}</span><Link href="/notices">자세히 <ArrowRight size={14} /></Link></div></section>}

    <section className="community-hero"><div className="container community-hero-grid"><div className="community-copy"><span className="section-kicker"><ShieldCheck size={14} /> Official 𝐃𝐲𝐧𝐚𝐦𝐢𝐜 Event</span><h1>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃</h1><p className="official-lead">𝐃𝐲𝐧𝐚𝐦𝐢𝐜 Event server</p><p className="official-sublead">𝐃𝐲𝐧𝐚𝐦𝐢𝐜 제공</p><div className="official-actions"><Link className="btn btn-primary btn-lg" href="/events"><Ticket size={18} /> 이벤트 확인</Link><Link className="btn btn-secondary btn-lg" href="/notices"><Megaphone size={18} /> 공지 보기</Link><Link className="btn btn-secondary btn-lg" href="/raffles"><UsersRound size={18} /> 전체 추첨</Link></div><div className="safe-service-note"><CheckCircle2 size={16} /> 𝐃𝐲𝐧𝐚𝐦𝐢𝐜에서 제공하는 이벤트 서버입니다.</div></div><aside className="official-contact-card clean-contact-card"><h2>공식 채널</h2><p>공지, 참여 안내, 문의는 아래 공식 채널을 기준으로 운영됩니다.</p><div className="official-link-list">{officialLinks.map((item) => <a key={item.label} href={item.href} target={item.href === "#" ? undefined : "_blank"} rel="noreferrer"><span>{item.label}</span><strong>{item.text ?? item.href}</strong><ExternalLink size={15} /></a>)}</div></aside></div></section>

    <section className="official-section first-info-section"><div className="container"><PublicEventBoard events={events} notices={notices} /></div></section>

    <section className="official-section"><div className="container"><PublicClawRaffle raffles={raffles} /></div></section>

    <section className="official-section compact-official-section"><div className="container official-two-column"><section className="public-card process-card"><span className="section-kicker">How it works</span><h2>운영 방식</h2><div className="process-steps"><div><CheckCircle2 size={18} /><strong>공지 확인</strong><span>진행 이벤트와 유의사항을 먼저 확인합니다.</span></div><div><Ticket size={18} /><strong>추첨권 사용</strong><span>지급받은 추첨권으로 직접 추첨에 참여합니다.</span></div><div><Radio size={18} /><strong>결과 공개</strong><span>전체 회원 추첨과 직접 추첨 결과를 공개합니다.</span></div></div></section><section className="public-card recent-card-front"><div className="official-card-head"><div><span className="section-kicker">Recent</span><h2>최근 결과</h2></div><Link href="/results">전체 보기 <ArrowRight size={15} /></Link></div><RecentResults results={results} compact /></section></div></section>

    <section className="official-section compact-official-section"><div className="container public-card policy-card"><ShieldCheck size={22} /><div><h2>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃</h2><p>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃는 온전한 이벤트 홈페이지로서 현금, 현물 등을 요구하지 않습니다.</p></div></div></section>
  </main>;
}
