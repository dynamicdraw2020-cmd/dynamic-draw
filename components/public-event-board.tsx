"use client";

import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Megaphone, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { EventPost, Notice } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function safeText(value: string | null | undefined, fallback = "자세한 안내는 관리자 공지를 확인해 주세요.") {
  const text = (value ?? "").trim();
  return text.length ? text : fallback;
}

export function PublicEventBoard({ events, notices }: { events: EventPost[]; notices: Notice[] }) {
  const [activeId, setActiveId] = useState(events[0]?.id ?? "");
  const activeEvent = useMemo(() => events.find((event) => event.id === activeId) ?? events[0] ?? null, [activeId, events]);
  const pinnedNotice = notices.find((notice) => notice.is_pinned) ?? notices[0] ?? null;
  const activeIndex = Math.max(0, events.findIndex((event) => event.id === activeEvent?.id));

  function move(offset: number) {
    if (!events.length) return;
    const nextIndex = (activeIndex + offset + events.length) % events.length;
    setActiveId(events[nextIndex].id);
  }

  return (
    <section className="home-event-console" aria-label="𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 이벤트 안내판">
      <div className="home-event-head">
        <div>
          <span className="section-kicker"><ClipboardList size={14} /> Event Desk</span>
          <h2>이벤트 안내</h2>
          <p>현재 진행중인 이벤트를 확인할 수 있습니다.</p>
        </div>
        <div className="home-event-controls">
          <button type="button" onClick={() => move(-1)} aria-label="이전 이벤트"><ChevronLeft size={18} /></button>
          <span>{events.length ? `${activeIndex + 1} / ${events.length}` : "0 / 0"}</span>
          <button type="button" onClick={() => move(1)} aria-label="다음 이벤트"><ChevronRight size={18} /></button>
        </div>
      </div>

      {pinnedNotice && (
        <div className="notice-strip">
          <Megaphone size={17} />
          <strong>{pinnedNotice.title}</strong>
          <span>{pinnedNotice.body}</span>
          <Link href="/notices">공지 보기 <ArrowRight size={14} /></Link>
        </div>
      )}

      <div className="event-desk-layout">
        <nav className="event-desk-tabs" aria-label="이벤트 선택">
          {events.length ? events.map((event) => (
            <button key={event.id} type="button" className={event.id === activeEvent?.id ? "active" : ""} onClick={() => setActiveId(event.id)}>
              <span>{event.status === "ACTIVE" ? "진행" : event.status === "ENDED" ? "종료" : "안내"}</span>
              <strong>{event.title}</strong>
              <small>{safeText(event.summary, "이벤트 상세를 확인해 주세요.")}</small>
            </button>
          )) : <div className="empty-light">공개된 이벤트가 없습니다.</div>}
        </nav>

        <article className={`event-detail-window ${activeEvent ? "open" : ""}`}>
          {activeEvent ? (
            <>
              <div className="window-chrome"><span /><span /><span /><small>dynamic2020.com/events/{activeEvent.slug}</small></div>
              <div className="event-detail-body">
                <div className="event-status-line">
                  <span className={`event-status ${activeEvent.status.toLowerCase()}`}>{activeEvent.status === "ACTIVE" ? "진행 중" : activeEvent.status === "ENDED" ? "종료" : "안내"}</span>
                  <span><CalendarDays size={14} /> {activeEvent.starts_at ? formatDateTime(activeEvent.starts_at) : "상시"}{activeEvent.ends_at ? ` ~ ${formatDateTime(activeEvent.ends_at)}` : ""}</span>
                </div>
                <h3>{activeEvent.title}</h3>
                <p className="event-summary-text">{safeText(activeEvent.summary)}</p>
                <div className="event-body-preview">{safeText(activeEvent.body, "참여 방법, 주의사항, 지급 기준은 운영 공지에 따라 안내됩니다.")}</div>
                <div className="event-window-actions">
                  <Link className="btn btn-primary" href={`/events/${activeEvent.slug}`}>상세 페이지 열기 <ArrowRight size={15} /></Link>
                  <Link className="btn btn-secondary" href="/play">뽑기&교환으로 이동</Link>
                </div>
              </div>
            </>
          ) : (
            <div className="event-detail-empty"><X size={24} /><strong>공개된 이벤트가 없습니다.</strong><span>관리자가 이벤트를 등록하면 이곳에 표시됩니다.</span></div>
          )}
        </article>
      </div>
    </section>
  );
}
