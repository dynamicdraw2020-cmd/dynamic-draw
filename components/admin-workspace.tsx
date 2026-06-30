/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { LoaderCircle, NotebookPen, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

type Data = { members: Array<Record<string, any>>; notes: Array<Record<string, any>>; meetings: Array<Record<string, any>> };

async function postWorkspace(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

function memberLabel(member: Record<string, any>) {
  return `${member.display_name ?? member.username ?? "회원"} · ${displayLoginId(member)} · ${member.role ?? "USER"}`;
}

export function AdminWorkspace({ data }: { data: Data }) {
  const router = useRouter();
  const [liveData, setLiveData] = useState<Data>(data);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [noteQuery, setNoteQuery] = useState("");

  const filteredNotes = useMemo(() => {
    const q = noteQuery.trim().toLowerCase();
    if (!q) return liveData.notes;
    return liveData.notes.filter((note) => {
      const profile = Array.isArray(note.profiles) ? note.profiles[0] : note.profiles;
      const creator = Array.isArray(note.creator) ? note.creator[0] : note.creator;
      return [note.note, profile?.display_name, profile?.username, profile?.member_code, creator?.display_name, creator?.username].join(" ").toLowerCase().includes(q);
    });
  }, [liveData.notes, noteQuery]);

  async function loadWorkspace() {
    try {
      setLoading("list");
      const response = await fetch(`/api/admin/workspace/list?ts=${Date.now()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "관리자 메모를 불러오지 못했습니다.");
      setLiveData({ members: body.data?.members ?? [], notes: body.data?.notes ?? [], meetings: body.data?.meetings ?? [] });
      setMessage({ type: "info", text: `메모 ${Number(body.data?.count?.notes ?? 0).toLocaleString()}개 · 회의록 ${Number(body.data?.count?.meetings ?? 0).toLocaleString()}개` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "관리자 메모를 불러오지 못했습니다." });
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => { void loadWorkspace(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setLoading(action);
      setMessage(null);
      await postWorkspace({ action, ...Object.fromEntries(new FormData(form).entries()) });
      setMessage({ type: "success", text: success });
      form.reset();
      await loadWorkspace();
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." });
    } finally {
      setLoading(null);
    }
  }

  async function remove(action: string, id: string, success: string) {
    if (!window.confirm("삭제할까요?")) return;
    try {
      setLoading(id);
      await postWorkspace({ action, id });
      setMessage({ type: "success", text: success });
      await loadWorkspace();
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "삭제하지 못했습니다." });
    } finally {
      setLoading(null);
    }
  }

  return <div className="grid gap-3 admin-workspace-mobile">
    {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
    <div className="workspace-topbar"><button className="btn btn-secondary btn-sm" type="button" onClick={() => void loadWorkspace()} disabled={loading === "list"}>{loading === "list" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} 새로고침</button></div>
    <div className="grid grid-2">
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-note", "관리자 메모를 저장했습니다.")}>
        <div className="flex items-center gap-1"><NotebookPen size={19} className="text-gold" /><h2 className="panel-title mb-0">관리자 메모</h2></div>
        <div className="field"><label>대상 회원</label><select className="select" name="profileId"><option value="">공통 메모</option>{liveData.members.map((member) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}</select></div>
        <div className="field"><label>메모</label><textarea className="textarea" name="note" rows={5} placeholder="운영자만 보는 메모" required /></div>
        <button className="btn btn-primary" disabled={loading === "create-note"}>{loading === "create-note" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 메모 저장</button>
      </form>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-meeting", "회의록을 저장했습니다.")}>
        <div className="flex items-center gap-1"><NotebookPen size={19} className="text-gold" /><h2 className="panel-title mb-0">회의록</h2></div>
        <div className="field"><label>회의 제목</label><input className="input" name="title" defaultValue="운영 회의" required /></div>
        <div className="field"><label>회의 내용</label><textarea className="textarea" name="body" rows={4} placeholder="논의 내용" required /></div>
        <div className="field"><label>결정 사항</label><textarea className="textarea" name="decisions" rows={3} placeholder="결정된 내용" /></div>
        <button className="btn btn-primary" disabled={loading === "create-meeting"}>{loading === "create-meeting" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 회의록 저장</button>
      </form>
    </div>
    <section className="panel panel-pad"><div className="support-admin-topbar"><h2 className="panel-title mb-0">최근 메모</h2><div className="support-search"><Search size={16} /><input className="input" value={noteQuery} onChange={(event) => setNoteQuery(event.target.value)} placeholder="회원/메모 검색" /></div></div><div className="result-list mt-2">{filteredNotes.length ? filteredNotes.map((note) => { const profile = Array.isArray(note.profiles) ? note.profiles[0] : note.profiles; const creator = Array.isArray(note.creator) ? note.creator[0] : note.creator; return <article className="result-row workspace-row" key={note.id}><div className="result-main"><strong>{profile?.display_name ?? profile?.username ?? "공통 메모"}</strong><span>{note.note}</span><span className="text-muted text-small">작성자: {creator?.display_name ?? creator?.username ?? "관리자"}</span></div><time className="result-time">{formatDateTime(note.created_at)}</time><button className="btn btn-danger btn-sm" type="button" onClick={() => remove("delete-note", note.id, "메모를 삭제했습니다.")} disabled={loading === note.id}><Trash2 size={14} /> 삭제</button></article>; }) : <div className="empty">메모가 없습니다.</div>}</div></section>
    <section className="panel panel-pad"><h2 className="panel-title">최근 회의록</h2><div className="result-list mt-2">{liveData.meetings.length ? liveData.meetings.map((meeting) => <article className="result-row workspace-row" key={meeting.id}><div className="result-main"><strong>{meeting.title}</strong><span>{meeting.body}</span><span className="text-muted">결정 사항: {meeting.decisions ?? "-"}</span></div><time className="result-time">{formatDateTime(meeting.created_at)}</time><button className="btn btn-danger btn-sm" type="button" onClick={() => remove("delete-meeting", meeting.id, "회의록을 삭제했습니다.")} disabled={loading === meeting.id}><Trash2 size={14} /> 삭제</button></article>) : <div className="empty">회의록이 없습니다.</div>}</div></section>
  </div>;
}
