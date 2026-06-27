import type { Metadata } from "next";
import { Megaphone, Pin } from "lucide-react";
import { getPublicNotices } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "공지" };
export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const notices = await getPublicNotices(50);
  return <main className="page"><div className="container"><div className="page-heading"><h1>공지</h1><p>운영 안내와 점검, 이벤트 관련 안내를 확인합니다.</p></div><div className="grid">{notices.length ? notices.map((notice) => <article className="panel panel-pad content-card" key={notice.id}><div className="content-card-head"><div className="metric-icon"><Megaphone size={20} /></div><div><h2>{notice.title}</h2><p>{formatDateTime(notice.created_at)}{notice.is_pinned ? " · 고정" : ""}</p></div>{notice.is_pinned && <span className="pill"><Pin size={13} /> 고정</span>}</div><p className="content-body">{notice.body}</p></article>) : <div className="panel empty">아직 공개된 공지가 없습니다.</div>}</div></div></main>;
}
