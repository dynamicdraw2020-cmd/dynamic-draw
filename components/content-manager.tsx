"use client";

import { CalendarDays, LoaderCircle, Megaphone, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { EventPost, Notice } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

async function jsonRequest(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function ContentManager({ notices, events }: { notices: Notice[]; events: EventPost[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function createNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("notice");
    const form = new FormData(event.currentTarget);
    try {
      await jsonRequest("/api/admin/notices", {
        title: form.get("title"),
        body: form.get("body"),
        isPinned: form.get("isPinned") === "on",
        isPublic: form.get("isPublic") === "on",
      });
      window.alert("공지 등록 완료");
      router.refresh();
    } catch (error) { window.alert((error as Error).message); }
    finally { setLoading(null); }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("event");
    const form = new FormData(event.currentTarget);
    try {
      await jsonRequest("/api/admin/events", {
        title: form.get("title"),
        slug: form.get("slug"),
        summary: form.get("summary"),
        body: form.get("body"),
        status: form.get("status"),
        isPublic: form.get("isPublic") === "on",
        startsAt: form.get("startsAt") || null,
        endsAt: form.get("endsAt") || null,
      });
      window.alert("이벤트 등록 완료");
      router.refresh();
    } catch (error) { window.alert((error as Error).message); }
    finally { setLoading(null); }
  }

  return <div className="grid">
    <div className="grid grid-2">
      <form className="panel panel-pad form-grid" onSubmit={createNotice}>
        <div><div className="flex items-center gap-1"><Megaphone size={19} className="text-gold" /><h2 className="panel-title mb-0">공지 등록</h2></div><p className="panel-description mt-1">서비스 운영 안내, 점검, 보상 안내를 공개 화면에 게시합니다.</p></div>
        <div className="field"><label htmlFor="notice-title">제목</label><input className="input" id="notice-title" name="title" maxLength={80} required placeholder="예: 이벤트 운영 안내" /></div>
        <div className="field"><label htmlFor="notice-body">내용</label><textarea className="textarea" id="notice-body" name="body" rows={6} maxLength={2000} required placeholder="회원에게 보여줄 공지 내용을 입력하세요." /></div>
        <label className="check-row"><input type="checkbox" name="isPinned" /> 상단 고정</label>
        <label className="check-row"><input type="checkbox" name="isPublic" defaultChecked /> 공개</label>
        <button className="btn btn-primary btn-lg" disabled={loading === "notice"} type="submit">{loading === "notice" ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />} 공지 등록</button>
      </form>

      <form className="panel panel-pad form-grid" onSubmit={createEvent}>
        <div><div className="flex items-center gap-1"><Sparkles size={19} className="text-gold" /><h2 className="panel-title mb-0">이벤트 등록</h2></div><p className="panel-description mt-1">이벤트 기간, 설명, 참여 안내를 별도 페이지에 공개합니다.</p></div>
        <div className="form-row"><div className="field"><label htmlFor="event-title">이벤트명</label><input className="input" id="event-title" name="title" maxLength={80} required placeholder="예: 5만냥 입장권 이벤트" /></div><div className="field"><label htmlFor="event-slug">주소 코드</label><input className="input" id="event-slug" name="slug" maxLength={80} required placeholder="ticket-event" /></div></div>
        <div className="field"><label htmlFor="event-summary">요약</label><input className="input" id="event-summary" name="summary" maxLength={160} placeholder="한 줄 설명" /></div>
        <div className="field"><label htmlFor="event-body">상세 설명</label><textarea className="textarea" id="event-body" name="body" rows={5} maxLength={4000} placeholder="참여 방법, 교환 기준, 유의사항" /></div>
        <div className="form-row"><div className="field"><label htmlFor="event-status">상태</label><select className="select" id="event-status" name="status" defaultValue="ACTIVE"><option value="DRAFT">준비 중</option><option value="ACTIVE">진행 중</option><option value="ENDED">종료</option><option value="ARCHIVED">보관</option></select></div><div className="field"><label htmlFor="event-starts">시작일</label><input className="input" id="event-starts" name="startsAt" type="datetime-local" /></div></div>
        <div className="field"><label htmlFor="event-ends">종료일</label><input className="input" id="event-ends" name="endsAt" type="datetime-local" /></div>
        <label className="check-row"><input type="checkbox" name="isPublic" defaultChecked /> 공개</label>
        <button className="btn btn-secondary btn-lg" disabled={loading === "event"} type="submit">{loading === "event" ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />} 이벤트 등록</button>
      </form>
    </div>

    <div className="grid grid-2">
      <section className="panel panel-pad"><h2 className="panel-title">공지 현황</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>제목</th><th>상태</th><th>등록일</th></tr></thead><tbody>{notices.length ? notices.map((notice) => <tr key={notice.id}><td><strong>{notice.title}</strong><div className="text-muted text-small">{notice.body.slice(0, 80)}{notice.body.length > 80 ? "…" : ""}</div></td><td>{notice.is_public ? "공개" : "숨김"}{notice.is_pinned ? " · 고정" : ""}</td><td className="muted">{formatDateTime(notice.created_at)}</td></tr>) : <tr><td colSpan={3}><div className="empty">등록된 공지가 없습니다.</div></td></tr>}</tbody></table></div></section>
      <section className="panel panel-pad"><h2 className="panel-title">이벤트 현황</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>이벤트</th><th>상태</th><th>기간</th></tr></thead><tbody>{events.length ? events.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><div className="text-muted text-small">/{item.slug}</div></td><td>{item.status}{item.is_public ? " · 공개" : " · 숨김"}</td><td className="muted"><CalendarDays size={13} style={{ verticalAlign: -2 }} /> {item.starts_at ? formatDateTime(item.starts_at) : "상시"}{item.ends_at ? ` ~ ${formatDateTime(item.ends_at)}` : ""}</td></tr>) : <tr><td colSpan={3}><div className="empty">등록된 이벤트가 없습니다.</div></td></tr>}</tbody></table></div></section>
    </div>
  </div>;
}
