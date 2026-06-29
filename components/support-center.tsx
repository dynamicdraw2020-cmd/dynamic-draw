"use client";

import { LoaderCircle, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Ticket = { id: string; category: string; title: string; body: string; status: string; admin_reply: string | null; answer?: string | null; internal_memo?: string | null; created_at: string; updated_at: string };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

function statusLabel(status: string) {
  if (status === "OPEN") return "접수";
  if (status === "ANSWERED") return "답변 완료";
  if (status === "CLOSED") return "종료";
  return status;
}

function supportProfileName(value: unknown) {
  const profile = Array.isArray(value) ? value[0] : value as { display_name?: string | null; username?: string | null } | null | undefined;
  return profile?.display_name ?? profile?.username ?? "회원";
}

export function SupportCenter({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setLoading(true);
      setMessage(null);
      await postJson("/api/support/tickets", { category: String(data.get("category") ?? "기타"), title: String(data.get("title") ?? ""), body: String(data.get("body") ?? "") });
      form.reset();
      setMessage({ type: "success", text: "문의가 접수되었습니다." });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "문의를 접수하지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  return <div className="grid gap-3 support-center-mobile">
    {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
    <form className="panel panel-pad form-grid" onSubmit={submit}>
      <h2 className="panel-title">문의 작성</h2>
      <p className="panel-description">문의 접수 후 답변은 이 화면의 내 문의 내역에서 확인할 수 있습니다.</p>
      <div className="form-row"><select className="select" name="category" defaultValue="지급 오류"><option>지급 오류</option><option>추첨권 문의</option><option>화폐 문의</option><option>계정 문의</option><option>이벤트 문의</option><option>기타</option></select><input className="input" name="title" placeholder="제목" required maxLength={100} /></div>
      <textarea className="textarea" name="body" placeholder="문의 내용을 입력해 주세요." rows={6} required maxLength={2000} />
      <button className="btn btn-primary" disabled={loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />} 문의 접수</button>
    </form>
    <section className="panel panel-pad"><h2 className="panel-title">내 문의 내역</h2><div className="result-list mt-3">{tickets.length ? tickets.map((ticket) => { const reply = ticket.admin_reply ?? ticket.answer ?? null; return <article className="result-row" key={ticket.id}><div className="result-main"><strong>{ticket.title} · {statusLabel(ticket.status)}</strong><span>{ticket.category} · {ticket.body}</span>{reply && <span className="note-box">답변: {reply}</span>}</div><time className="result-time">{new Date(ticket.created_at).toLocaleString("ko-KR")}</time></article>; }) : <div className="empty">문의 내역이 없습니다.</div>}</div></section>
  </div>;
}

export function AdminSupportManager({ tickets }: { tickets: Array<Ticket & { profiles?: { display_name?: string | null; username?: string | null } | null }> }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setLoading(id);
      await postJson("/api/admin/support", { action: "reply", id, status: String(data.get("status") ?? "ANSWERED"), adminReply: String(data.get("adminReply") ?? ""), internalMemo: String(data.get("internalMemo") ?? "") });
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "답변을 저장하지 못했습니다.");
    } finally {
      setLoading(null);
    }
  }
  async function remove(id: string) {
    if (!confirm("문의를 삭제할까요?")) return;
    try { setLoading(`delete-${id}`); await postJson("/api/admin/support", { action: "delete", id }); router.refresh(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "문의를 삭제하지 못했습니다."); }
    finally { setLoading(null); }
  }
  return <section className="panel panel-pad support-admin-mobile"><h2 className="panel-title">문의센터 관리</h2><p className="panel-description">문의 답변, 종료, 삭제를 한 화면에서 처리합니다.</p><div className="grid gap-2 mt-3">{tickets.length ? tickets.map((ticket) => { const reply = ticket.admin_reply ?? ticket.answer ?? ""; return <article className="panel-soft" key={ticket.id}><div className="flex items-center justify-between gap-2 wrap"><div><strong>{ticket.title} · {statusLabel(ticket.status)}</strong><p className="text-muted text-small">{supportProfileName(ticket.profiles)} · {ticket.category} · {new Date(ticket.created_at).toLocaleString("ko-KR")}</p></div><button className="btn btn-danger btn-sm" type="button" disabled={loading === `delete-${ticket.id}`} onClick={() => remove(ticket.id)}>{loading === `delete-${ticket.id}` ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />} 삭제</button></div><p className="notice-body mt-2">{ticket.body}</p><form className="form-grid mt-2" onSubmit={(event) => submit(event, ticket.id)}><select className="select" name="status" defaultValue={ticket.status}><option value="OPEN">접수</option><option value="ANSWERED">답변 완료</option><option value="CLOSED">종료</option></select><textarea className="textarea" name="adminReply" defaultValue={reply} rows={3} placeholder="회원에게 보이는 답변" /><textarea className="textarea" name="internalMemo" defaultValue={ticket.internal_memo ?? ""} rows={2} placeholder="관리자 내부 메모" /><button className="btn btn-secondary" disabled={loading === ticket.id}>{loading === ticket.id ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} 저장</button></form></article>; }) : <div className="empty">접수된 문의가 없습니다.</div>}</div></section>;
}
