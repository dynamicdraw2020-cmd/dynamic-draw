import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Megaphone } from "lucide-react";
import { getPublicEventBySlug, getPublicNotices } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);
  return { title: event ? `${event.title} · 𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃` : "이벤트 상세" };
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [event, notices] = await Promise.all([getPublicEventBySlug(slug), getPublicNotices(3)]);
  if (!event) notFound();
  return <main className="public-subpage event-detail-page"><section className="page"><div className="container event-detail-grid"><article className="public-card event-detail-main"><Link className="btn btn-secondary btn-sm" href="/events"><ArrowLeft size={15} /> 이벤트 목록</Link><div className="event-status-line mt-3"><span className={`event-status ${event.status.toLowerCase()}`}>{event.status === "ACTIVE" ? "진행 중" : event.status === "ENDED" ? "종료" : "안내"}</span><span><CalendarDays size={14} /> {event.starts_at ? formatDateTime(event.starts_at) : "상시"}{event.ends_at ? ` ~ ${formatDateTime(event.ends_at)}` : ""}</span></div><h1>{event.title}</h1>{event.summary && <p className="event-detail-summary">{event.summary}</p>}<div className="event-detail-body-copy">{event.body || "이벤트 상세 안내가 곧 등록됩니다."}</div><div className="event-guide-box"><CheckCircle2 size={18} /><div><strong>참여 전 확인</strong><span>공지와 이벤트 상세 내용을 확인한 뒤 추첨권을 사용해 주세요. 실제 결과는 서버에서 먼저 결정됩니다.</span></div></div></article><aside className="event-detail-side"><section className="public-card"><h2><Megaphone size={18} /> 최근 공지</h2><div className="official-list">{notices.map((notice) => <article key={notice.id}><strong>{notice.title}</strong><p>{notice.body}</p></article>)}</div></section><section className="public-card"><h2><ClipboardList size={18} /> 바로가기</h2><div className="side-link-list"><Link href="/play">직접 추첨</Link><Link href="/raffles">전체 회원 추첨</Link><Link href="/probabilities">확률 안내</Link></div></section></aside></div></section></main>;
}
