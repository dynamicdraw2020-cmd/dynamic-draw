import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { getPublicEvents } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "이벤트" };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getPublicEvents(60);
  return <main className="public-subpage"><section className="page"><div className="container"><div className="public-page-heading"><span className="section-kicker">Events</span><h1>Dynamic D 이벤트</h1><p>진행 중인 이벤트와 참여 안내를 확인합니다.</p></div><div className="event-card-grid">{events.length ? events.map((event) => <article className="public-card event-list-card" key={event.id}><span className={`event-status ${event.status.toLowerCase()}`}>{event.status === "ACTIVE" ? "진행 중" : event.status === "ENDED" ? "종료" : "안내"}</span><h2>{event.title}</h2><p>{event.summary || event.body || "이벤트 상세 안내를 확인해 주세요."}</p><div className="event-card-meta"><CalendarDays size={14} /> {event.starts_at ? formatDateTime(event.starts_at) : "상시"}{event.ends_at ? ` ~ ${formatDateTime(event.ends_at)}` : ""}</div><Link className="btn btn-secondary" href={`/events/${event.slug}`}>상세 보기 <ArrowRight size={15} /></Link></article>) : <div className="empty-light">공개된 이벤트가 없습니다.</div>}</div></div></section></main>;
}
