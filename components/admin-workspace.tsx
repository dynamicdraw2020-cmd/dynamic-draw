/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { LoaderCircle, NotebookPen, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

type Data = { members: Array<Record<string, any>>; notes: Array<Record<string, any>>; meetings: Array<Record<string, any>> };

async function postWorkspace(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function AdminWorkspace({ data }: { data: Data }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    try { setLoading(action); setMessage(null); await postWorkspace({ action, ...Object.fromEntries(new FormData(form).entries()) }); setMessage({ type: "success", text: success }); form.reset(); router.refresh(); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." }); }
    finally { setLoading(null); }
  }
  return <div className="grid gap-3">
    {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
    <div className="grid grid-2">
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-note", "관리자 메모를 저장했습니다.")}>
        <div className="flex items-center gap-1"><NotebookPen size={19} className="text-gold" /><h2 className="panel-title mb-0">관리자 메모</h2></div>
        <div className="field"><label>대상 회원</label><select className="select" name="profileId"><option value="">공통 메모</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {displayLoginId(member)} · {member.role}</option>)}</select></div>
        <div className="field"><label>메모</label><textarea className="textarea" name="note" rows={5} placeholder="운영자만 보는 메모" /></div>
        <button className="btn btn-primary" disabled={loading === "create-note"}>{loading === "create-note" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 메모 저장</button>
      </form>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-meeting", "회의록을 저장했습니다.")}>
        <div className="flex items-center gap-1"><NotebookPen size={19} className="text-gold" /><h2 className="panel-title mb-0">회의록</h2></div>
        <div className="field"><label>회의 제목</label><input className="input" name="title" defaultValue="운영 회의" /></div>
        <div className="field"><label>회의 내용</label><textarea className="textarea" name="body" rows={4} placeholder="논의 내용" /></div>
        <div className="field"><label>결정 사항</label><textarea className="textarea" name="decisions" rows={3} placeholder="결정된 내용" /></div>
        <button className="btn btn-primary" disabled={loading === "create-meeting"}>{loading === "create-meeting" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 회의록 저장</button>
      </form>
    </div>
    <section className="panel panel-pad"><h2 className="panel-title">최근 메모</h2><div className="result-list mt-2">{data.notes.length ? data.notes.map((note) => { const profile = Array.isArray(note.profiles) ? note.profiles[0] : note.profiles; return <article className="result-row" key={note.id}><div className="result-main"><strong>{profile?.display_name ?? "공통 메모"}</strong><span>{note.note}</span></div><time className="result-time">{formatDateTime(note.created_at)}</time></article>; }) : <div className="empty">메모가 없습니다.</div>}</div></section>
    <section className="panel panel-pad"><h2 className="panel-title">최근 회의록</h2><div className="result-list mt-2">{data.meetings.length ? data.meetings.map((meeting) => <article className="result-row" key={meeting.id}><div className="result-main"><strong>{meeting.title}</strong><span>{meeting.body}</span><span className="text-muted">결정 사항: {meeting.decisions ?? "-"}</span></div><time className="result-time">{formatDateTime(meeting.created_at)}</time></article>) : <div className="empty">회의록이 없습니다.</div>}</div></section>
  </div>;
}
