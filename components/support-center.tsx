"use client";

import { LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Ticket = { id: string; category: string; title: string; body: string; status: string; admin_reply: string | null; created_at: string; updated_at: string };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function SupportCenter({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setLoading(true);
      setMessage(null);
      await postJson("/api/support/tickets", { category: String(data.get("category") ?? "기타"), title: String(data.get("title") ?? ""), body: String(data.get("body") ?? "") });
      form.reset();
      setMessage("문의가 접수되었습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문의를 접수하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="grid gap-3">
    {message && <div className="form-message form-success">{message}</div>}
    <form className="panel panel-pad form-grid" onSubmit={submit}>
      <h2 className="panel-title">문의 작성</h2>
      <div className="form-row"><select className="select" name="category" defaultValue="지급 오류"><option>지급 오류</option><option>추첨권 문의</option><option>화폐 문의</option><option>계정 문의</option><option>이벤트 문의</option><option>기타</option></select><input className="input" name="title" placeholder="제목" required maxLength={100} /></div>
      <textarea className="textarea" name="body" placeholder="문의 내용을 입력해 주세요." rows={6} required maxLength={2000} />
      <button className="btn btn-primary" disabled={loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />} 문의 접수</button>
    </form>
    <section className="panel panel-pad"><h2 className="panel-title">내 문의 내역</h2><div className="result-list mt-3">{tickets.length ? tickets.map((ticket) => <article className="result-row" key={ticket.id}><div className="result-main"><strong>{ticket.title} · {ticket.status}</strong><span>{ticket.category} · {ticket.body}</span>{ticket.admin_reply && <span>답변: {ticket.admin_reply}</span>}</div><time className="result-time">{new Date(ticket.created_at).toLocaleString("ko-KR")}</time></article>) : <div className="empty">문의 내역이 없습니다.</div>}</div></section>
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
      await postJson("/api/admin/support", { id, status: String(data.get("status") ?? "ANSWERED"), adminReply: String(data.get("adminReply") ?? "") });
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "답변을 저장하지 못했습니다.");
    } finally {
      setLoading(null);
    }
  }
  return <section className="panel panel-pad"><h2 className="panel-title">문의센터 관리</h2><div className="grid gap-2 mt-3">{tickets.length ? tickets.map((ticket) => <article className="panel-soft" key={ticket.id}><strong>{ticket.title} · {ticket.status}</strong><p className="text-muted text-small">{ticket.profiles?.display_name ?? ticket.profiles?.username ?? "회원"} · {ticket.category} · {new Date(ticket.created_at).toLocaleString("ko-KR")}</p><p className="notice-body mt-2">{ticket.body}</p><form className="form-grid mt-2" onSubmit={(event) => submit(event, ticket.id)}><select className="select" name="status" defaultValue={ticket.status}><option value="OPEN">OPEN</option><option value="ANSWERED">ANSWERED</option><option value="CLOSED">CLOSED</option></select><textarea className="textarea" name="adminReply" defaultValue={ticket.admin_reply ?? ""} rows={3} placeholder="답변 또는 내부 처리 메모" /><button className="btn btn-secondary" disabled={loading === ticket.id}>{loading === ticket.id ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} 저장</button></form></article>) : <div className="empty">접수된 문의가 없습니다.</div>}</div></section>;
}
