import type { Metadata } from "next";
import { CalendarDays, Sparkles } from "lucide-react";
import { getPublicEvents } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "이벤트" };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getPublicEvents(50);
  return <main className="page"><div className="container"><div className="page-heading"><h1>이벤트</h1><p>진행 중이거나 공개된 이벤트 안내를 확인합니다.</p></div><div className="grid grid-2">{events.length ? events.map((item) => <article className="panel panel-pad content-card" key={item.id}><div className="content-card-head"><div className="metric-icon"><Sparkles size={20} /></div><div><h2>{item.title}</h2><p>{item.status === "ACTIVE" ? "진행 중" : item.status === "ENDED" ? "종료" : "안내"}</p></div></div>{item.summary && <p className="content-summary">{item.summary}</p>}{item.body && <p className="content-body">{item.body}</p>}<div className="content-meta"><CalendarDays size={14} /> {item.starts_at ? formatDateTime(item.starts_at) : "상시 시작"}{item.ends_at ? ` ~ ${formatDateTime(item.ends_at)}` : ""}</div></article>) : <div className="panel empty">아직 공개된 이벤트가 없습니다.</div>}</div></div></main>;
}
