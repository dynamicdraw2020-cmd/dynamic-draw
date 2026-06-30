"use client";

import { Image as ImageIcon, LoaderCircle, Search, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { formatDateTime } from "@/lib/utils";

type Attachment = { name: string; type: string; size: number; dataUrl: string };
type ProfileLite = { id?: string | null; display_name?: string | null; username?: string | null; member_code?: string | null };
type TicketStatus = "OPEN" | "ANSWERED" | "CLOSED";
type Ticket = {
  id: string;
  profile_id?: string | null;
  category: string;
  title: string;
  body: string;
  status: TicketStatus | string;
  admin_reply: string | null;
  internal_memo?: string | null;
  attachments?: Attachment[] | null;
  created_at: string;
  updated_at: string;
  profiles?: ProfileLite | null;
};

const STATUS_LABELS: Record<string, string> = { OPEN: "신규", ANSWERED: "진행중", CLOSED: "닫힘" };
const STATUS_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "OPEN", label: "신규" },
  { value: "ANSWERED", label: "진행중" },
  { value: "CLOSED", label: "닫힘" },
];

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? "신규";
}

function statusClass(status: string) {
  if (status === "OPEN") return "support-status status-open";
  if (status === "ANSWERED") return "support-status status-answered";
  if (status === "CLOSED") return "support-status status-closed";
  return "support-status status-open";
}

function niceDate(value: string) {
  try {
    return formatDateTime(value);
  } catch {
    return value;
  }
}

function userLabel(ticket: Ticket) {
  return ticket.profiles?.display_name || ticket.profiles?.username || ticket.profile_id || "회원";
}

function userCode(ticket: Ticket) {
  return ticket.profiles?.member_code || ticket.profiles?.username || ticket.profile_id || "-";
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AttachmentPreview({ items }: { items?: Attachment[] | null }) {
  if (!items?.length) return null;
  return (
    <div className="support-attachments">
      {items.map((item, index) => (
        <a key={`${item.name}-${index}`} href={item.dataUrl} target="_blank" rel="noreferrer">
          <img src={item.dataUrl} alt={item.name} />
          <span>{item.name}</span>
        </a>
      ))}
    </div>
  );
}

function TicketDetailModal({ ticket, onClose, admin = false }: { ticket: Ticket; onClose: () => void; admin?: boolean }) {
  return (
    <div className="support-modal" role="dialog" aria-modal="true">
      <div className="support-modal-card panel panel-pad">
        <div className="support-modal-head">
          <div>
            <span className={statusClass(ticket.status)}>{statusLabel(ticket.status)}</span>
            <h2>{ticket.title}</h2>
            <p>{ticket.category} · {niceDate(ticket.created_at)}</p>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}><X size={16} /> 닫기</button>
        </div>
        {admin && (
          <div className="support-detail-grid">
            <strong>문의자</strong><span>{userLabel(ticket)}</span>
            <strong>유저 ID</strong><span>{userCode(ticket)}</span>
            <strong>Profile ID</strong><span>{ticket.profile_id ?? "-"}</span>
          </div>
        )}
        <div className="support-detail-block"><strong>문의 내용</strong><p>{ticket.body}</p></div>
        <AttachmentPreview items={ticket.attachments} />
        <div className="support-detail-block answer"><strong>답변</strong><p>{ticket.admin_reply || "아직 답변이 없습니다."}</p></div>
        {admin && <div className="support-detail-block"><strong>내부 메모</strong><p>{ticket.internal_memo || "내부 메모가 없습니다."}</p></div>}
      </div>
    </div>
  );
}

export function SupportCenter({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [filter, setFilter] = useState("ALL");

  const filteredTickets = useMemo(() => tickets.filter((ticket) => filter === "ALL" || ticket.status === filter), [tickets, filter]);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 3);
    const converted: Attachment[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 1_200_000) { window.alert(`${file.name}은 1.2MB 이하만 첨부할 수 있습니다.`); continue; }
      converted.push({ name: file.name, type: file.type, size: file.size, dataUrl: await fileToDataUrl(file) });
    }
    setAttachments((prev) => [...prev, ...converted].slice(0, 3));
    event.currentTarget.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setLoading(true);
      setMessage(null);
      await postJson("/api/support/tickets", { category: String(data.get("category") ?? "기타"), title: String(data.get("title") ?? ""), body: String(data.get("body") ?? ""), attachments });
      form.reset();
      setAttachments([]);
      setMessage("문의가 접수되었습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문의를 접수하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-3 support-mobile-stack support-v2">
      {message && <div className="form-message form-success">{message}</div>}
      <form className="panel panel-pad form-grid support-write-card" onSubmit={submit}>
        <h2 className="panel-title">문의 작성</h2>
        <div className="form-row">
          <select className="select" name="category" defaultValue="지급 오류">
            <option>지급 오류</option><option>추첨권 문의</option><option>화폐 문의</option><option>계정 문의</option><option>이벤트 문의</option><option>기타</option>
          </select>
          <input className="input" name="title" placeholder="제목" required maxLength={100} />
        </div>
        <textarea className="textarea" name="body" placeholder="문의 내용을 입력해 주세요." rows={6} required maxLength={2000} />
        <div className="support-file-box">
          <label className="btn btn-secondary"><ImageIcon size={16} /> 사진 첨부<input type="file" accept="image/*" multiple onChange={onFiles} hidden /></label>
          <span>최대 3장 · 각 1.2MB 이하</span>
        </div>
        {attachments.length > 0 && <div className="support-attachments editable">{attachments.map((item, index) => <div key={`${item.name}-${index}`}><img src={item.dataUrl} alt={item.name} /><button type="button" onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}><X size={14} /></button><span>{item.name}</span></div>)}</div>}
        <button className="btn btn-primary" disabled={loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />} 문의 접수</button>
      </form>

      <section className="panel panel-pad support-list-card">
        <div className="support-list-head">
          <h2 className="panel-title">내 문의 내역</h2>
          <select className="select support-filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="support-ticket-list mt-3">
          {filteredTickets.length ? filteredTickets.map((ticket) => (
            <article className="support-ticket-card v2" key={ticket.id}>
              <div className="support-ticket-main">
                <div className="support-ticket-titleline"><span className={statusClass(ticket.status)}>{statusLabel(ticket.status)}</span><strong>{ticket.title}</strong></div>
                <p>{ticket.category}</p>
                <p className="support-body-preview">{ticket.body.length > 110 ? `${ticket.body.slice(0, 110)}…` : ticket.body}</p>
                {ticket.admin_reply && <p className="support-reply-preview">답변: {ticket.admin_reply.length > 80 ? `${ticket.admin_reply.slice(0, 80)}…` : ticket.admin_reply}</p>}
                <time>{niceDate(ticket.created_at)}</time>
              </div>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelected(ticket)}>자세히 보기</button>
            </article>
          )) : <div className="empty">문의 내역이 없습니다.</div>}
        </div>
      </section>
      {selected && <TicketDetailModal ticket={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export function AdminSupportManager({ tickets }: { tickets: Array<Ticket & { profiles?: ProfileLite | null }> }) {
  const router = useRouter();
  const [liveTickets, setLiveTickets] = useState<Array<Ticket & { profiles?: ProfileLite | null }>>(tickets);
  const [loading, setLoading] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);

  const filteredTickets = useMemo(() => liveTickets.filter((ticket) => {
    const statusOk = statusFilter === "ALL" || ticket.status === statusFilter;
    const q = query.trim().toLowerCase();
    if (!q) return statusOk;
    const values = [ticket.id, ticket.profile_id ?? "", ticket.title, ticket.body, ticket.category, ticket.profiles?.display_name ?? "", ticket.profiles?.username ?? "", ticket.profiles?.member_code ?? ""].join(" ").toLowerCase();
    return statusOk && values.includes(q);
  }), [liveTickets, statusFilter, query]);

  async function loadTickets() {
    try {
      setLoading("list");
      const response = await fetch(`/api/admin/support/list?ts=${Date.now()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "문의 목록을 불러오지 못했습니다.");
      setLiveTickets(body.data?.tickets ?? []);
      setListMessage(`불러온 문의 ${Number(body.data?.count ?? 0).toLocaleString()}개`);
    } catch (error) {
      setListMessage(error instanceof Error ? error.message : "문의 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => { void loadTickets(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setLoading(id);
      await postJson("/api/admin/support", { id, status: String(data.get("status") ?? "ANSWERED"), adminReply: String(data.get("adminReply") ?? ""), internalMemo: String(data.get("internalMemo") ?? "") });
      await loadTickets();
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "답변을 저장하지 못했습니다.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="panel panel-pad admin-support-panel support-v2">
      <div className="support-admin-topbar">
        <div><h2 className="panel-title mb-0">문의센터 관리</h2><span>{listMessage || `문의 ${liveTickets.length.toLocaleString()}개`}</span></div>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => void loadTickets()} disabled={loading === "list"}>{loading === "list" ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />} 새로고침</button>
      </div>
      <div className="support-admin-filters">
        <select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <div className="support-search"><Search size={16} /><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="유저 ID, 닉네임, 회원코드, 제목, 내용 검색" /></div>
      </div>
      <div className="support-admin-list mt-3">
        {filteredTickets.length ? filteredTickets.map((ticket) => (
          <article className="support-admin-card v2" key={ticket.id}>
            <div className="support-admin-summary">
              <div className="support-ticket-titleline"><span className={statusClass(ticket.status)}>{statusLabel(ticket.status)}</span><strong>{ticket.title}</strong></div>
              <p>{userLabel(ticket)} · {userCode(ticket)} · {ticket.category}</p>
              <time>{niceDate(ticket.created_at)}</time>
            </div>
            <p className="support-body-preview">{ticket.body.length > 160 ? `${ticket.body.slice(0, 160)}…` : ticket.body}</p>
            <AttachmentPreview items={ticket.attachments} />
            <div className="table-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelected(ticket)}>자세히 보기</button></div>
            <form className="form-grid mt-2" onSubmit={(event) => submit(event, ticket.id)}>
              <select className="select" name="status" defaultValue={ticket.status}><option value="OPEN">신규</option><option value="ANSWERED">진행중</option><option value="CLOSED">닫힘</option></select>
              <textarea className="textarea" name="adminReply" defaultValue={ticket.admin_reply ?? ""} rows={3} placeholder="회원에게 보일 답변" />
              <textarea className="textarea" name="internalMemo" defaultValue={ticket.internal_memo ?? ""} rows={2} placeholder="관리자 내부 메모" />
              <button className="btn btn-secondary" disabled={loading === ticket.id}>{loading === ticket.id ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} 저장</button>
            </form>
          </article>
        )) : <div className="empty">조건에 맞는 문의가 없습니다.</div>}
      </div>
      {selected && <TicketDetailModal ticket={selected} onClose={() => setSelected(null)} admin />}
    </section>
  );
}
