/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { CheckCircle2, Eye, LoaderCircle, NotebookPen, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

type Data = { members: Array<Record<string, any>>; notes: Array<Record<string, any>>; meetings: Array<Record<string, any>> };
type CurrentAdmin = { id: string; role: string };

type NoteRow = Record<string, any> & {
  id: string;
  note: string;
  created_at: string;
  profiles?: Record<string, any> | null;
  creator?: Record<string, any> | null;
  read_by_me?: boolean;
  read_count?: number;
  read_list?: Array<Record<string, any>>;
};

async function postWorkspace(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data.data ?? data;
}

function memberLabel(member: Record<string, any>) {
  return `${member.display_name ?? member.username ?? "회원"} · ${displayLoginId(member)} · ${member.role ?? "USER"}`;
}

function personName(value: Record<string, any> | null | undefined, fallback = "관리자") {
  return value?.display_name ?? value?.username ?? value?.member_code ?? fallback;
}

function NoteDetailModal({ note, currentAdmin, onClose, onAck, onDelete, loading }: { note: NoteRow; currentAdmin: CurrentAdmin; onClose: () => void; onAck: (note: NoteRow) => void; onDelete: (note: NoteRow) => void; loading: string | null }) {
  const profile = Array.isArray(note.profiles) ? note.profiles[0] : note.profiles;
  const creator = Array.isArray(note.creator) ? note.creator[0] : note.creator;
  const readList = Array.isArray(note.read_list) ? note.read_list : [];
  return <div className="support-modal" role="dialog" aria-modal="true">
    <div className="support-modal-card panel panel-pad memo-detail-modal">
      <div className="support-modal-head">
        <div>
          <span className={note.read_by_me ? "support-status status-answered" : "support-status status-open"}>{note.read_by_me ? "확인함" : "미확인"}</span>
          <h2>{profile ? personName(profile, "대상 회원") : "공통 메모"}</h2>
          <p>{formatDateTime(note.created_at)} · 작성자 {personName(creator)}</p>
        </div>
        <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}><X size={16} /> 닫기</button>
      </div>
      <div className="support-detail-block"><strong>메모 내용</strong><p>{note.note}</p></div>
      <div className="support-detail-grid">
        <strong>대상</strong><span>{profile ? memberLabel(profile) : "공통 메모"}</span>
        <strong>확인 수</strong><span>{Number(note.read_count ?? 0).toLocaleString()}명</span>
      </div>
      {currentAdmin.role === "SUPER_ADMIN" && <div className="support-detail-block">
        <strong>확인 명단</strong>
        {readList.length ? <div className="memo-read-list">{readList.map((row) => {
          const admin = row.admin as Record<string, any> | null;
          return <span key={`${note.id}-${row.admin_id}`}>{personName(admin, String(row.admin_id))} · {formatDateTime(String(row.read_at))}</span>;
        })}</div> : <p>아직 확인한 관리자가 없습니다.</p>}
      </div>}
      <div className="table-actions mt-2">
        <button className="btn btn-primary" type="button" onClick={() => onAck(note)} disabled={loading === `ack-${note.id}`}>
          {loading === `ack-${note.id}` ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />} {note.read_by_me ? "확인 취소" : "확인 체크"}
        </button>
        <button className="btn btn-danger" type="button" onClick={() => onDelete(note)} disabled={loading === note.id}><Trash2 size={16} /> 삭제</button>
      </div>
    </div>
  </div>;
}

export function AdminWorkspace({ data, currentAdmin }: { data: Data; currentAdmin: CurrentAdmin }) {
  const router = useRouter();
  const [liveData, setLiveData] = useState<Data>(data);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [noteQuery, setNoteQuery] = useState("");
  const [noteStatus, setNoteStatus] = useState("ALL");
  const [selectedNote, setSelectedNote] = useState<NoteRow | null>(null);

  const filteredNotes = useMemo(() => {
    const q = noteQuery.trim().toLowerCase();
    return (liveData.notes as NoteRow[]).filter((note) => {
      const profile = Array.isArray(note.profiles) ? note.profiles[0] : note.profiles;
      const creator = Array.isArray(note.creator) ? note.creator[0] : note.creator;
      const text = [note.note, profile?.display_name, profile?.username, profile?.member_code, creator?.display_name, creator?.username].join(" ").toLowerCase();
      const matchesQuery = !q || text.includes(q);
      const matchesStatus = noteStatus === "ALL" || (noteStatus === "READ" ? Boolean(note.read_by_me) : !note.read_by_me);
      return matchesQuery && matchesStatus;
    });
  }, [liveData.notes, noteQuery, noteStatus]);

  const uncheckedCount = (liveData.notes as NoteRow[]).filter((note) => !note.read_by_me).length;

  async function loadWorkspace(showInfo = true) {
    try {
      setLoading("list");
      const response = await fetch(`/api/admin/workspace/list?ts=${Date.now()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "관리자 메모를 불러오지 못했습니다.");
      setLiveData({ members: body.data?.members ?? [], notes: body.data?.notes ?? [], meetings: body.data?.meetings ?? [] });
      if (showInfo) setMessage({ type: "info", text: `메모 ${Number(body.data?.count?.notes ?? 0).toLocaleString()}개 · 미확인 ${uncheckedCount.toLocaleString()}개` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "관리자 메모를 불러오지 못했습니다." });
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => { void loadWorkspace(false); }, []);

  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setLoading(action);
      setMessage(null);
      const created = await postWorkspace({ action, ...Object.fromEntries(new FormData(form).entries()) });
      setMessage({ type: "success", text: success });
      form.reset();
      if (action === "create-note") {
        setLiveData((prev) => ({ ...prev, notes: [{ ...created, creator: null, profiles: null, read_by_me: false, read_count: 0, read_list: [] }, ...prev.notes] }));
      } else if (action === "create-meeting") {
        setLiveData((prev) => ({ ...prev, meetings: [{ ...created, creator: null }, ...prev.meetings] }));
      }
      await loadWorkspace(false);
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." });
    } finally {
      setLoading(null);
    }
  }

  async function toggleAck(note: NoteRow) {
    try {
      setLoading(`ack-${note.id}`);
      const action = note.read_by_me ? "unacknowledge-note" : "acknowledge-note";
      await postWorkspace({ action, id: note.id });
      setLiveData((prev) => ({
        ...prev,
        notes: prev.notes.map((item) => item.id === note.id ? { ...item, read_by_me: !note.read_by_me, read_count: Math.max(0, Number(note.read_count ?? 0) + (note.read_by_me ? -1 : 1)) } : item),
      }));
      setSelectedNote((prev) => prev && prev.id === note.id ? { ...prev, read_by_me: !note.read_by_me, read_count: Math.max(0, Number(note.read_count ?? 0) + (note.read_by_me ? -1 : 1)) } : prev);
      setMessage({ type: "success", text: note.read_by_me ? "확인 체크를 취소했습니다." : "메모 확인을 체크했습니다." });
      await loadWorkspace(false);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "확인 처리를 저장하지 못했습니다." });
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
      if (action === "delete-note") setLiveData((prev) => ({ ...prev, notes: prev.notes.filter((note) => note.id !== id) }));
      else if (action === "delete-meeting") setLiveData((prev) => ({ ...prev, meetings: prev.meetings.filter((meeting) => meeting.id !== id) }));
      setSelectedNote(null);
      await loadWorkspace(false);
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "삭제하지 못했습니다." });
    } finally {
      setLoading(null);
    }
  }

  return <div className="grid gap-3 admin-workspace-mobile memo-console">
    {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
    <div className="workspace-topbar memo-toolbar">
      <div><strong>관리자 메모 콘솔</strong><span>미확인 {uncheckedCount.toLocaleString()}개</span></div>
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => void loadWorkspace()} disabled={loading === "list"}>{loading === "list" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} 새로고침</button>
    </div>

    <div className="grid grid-2 memo-editor-grid">
      <form className="panel panel-pad form-grid memo-card-form" onSubmit={(event) => submit(event, "create-note", "관리자 메모를 저장했습니다.")}>
        <div className="flex items-center gap-1"><NotebookPen size={19} className="text-gold" /><h2 className="panel-title mb-0">관리자 메모</h2></div>
        <div className="field"><label>대상 회원</label><select className="select" name="profileId"><option value="">공통 메모</option>{liveData.members.map((member) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}</select></div>
        <div className="field"><label>메모</label><textarea className="textarea" name="note" rows={5} placeholder="운영자만 보는 메모" required /></div>
        <button className="btn btn-primary" disabled={loading === "create-note"}>{loading === "create-note" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 메모 저장</button>
      </form>

      <form className="panel panel-pad form-grid memo-card-form" onSubmit={(event) => submit(event, "create-meeting", "회의록을 저장했습니다.")}>
        <div className="flex items-center gap-1"><NotebookPen size={19} className="text-gold" /><h2 className="panel-title mb-0">회의록</h2></div>
        <div className="field"><label>회의 제목</label><input className="input" name="title" defaultValue="운영 회의" required /></div>
        <div className="field"><label>회의 내용</label><textarea className="textarea" name="body" rows={4} placeholder="논의 내용" required /></div>
        <div className="field"><label>결정 사항</label><textarea className="textarea" name="decisions" rows={3} placeholder="결정된 내용" /></div>
        <button className="btn btn-primary" disabled={loading === "create-meeting"}>{loading === "create-meeting" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 회의록 저장</button>
      </form>
    </div>

    <section className="panel panel-pad memo-list-panel">
      <div className="support-admin-topbar memo-list-head">
        <h2 className="panel-title mb-0">최근 메모</h2>
        <div className="memo-filter-row">
          <select className="select" value={noteStatus} onChange={(event) => setNoteStatus(event.target.value)}><option value="ALL">전체</option><option value="UNREAD">미확인</option><option value="READ">확인함</option></select>
          <div className="support-search"><Search size={16} /><input className="input" value={noteQuery} onChange={(event) => setNoteQuery(event.target.value)} placeholder="회원/메모 검색" /></div>
        </div>
      </div>
      <div className="memo-card-list mt-2">{filteredNotes.length ? filteredNotes.map((note) => {
        const profile = Array.isArray(note.profiles) ? note.profiles[0] : note.profiles;
        const creator = Array.isArray(note.creator) ? note.creator[0] : note.creator;
        return <article className={`memo-card ${note.read_by_me ? "is-read" : "is-unread"}`} key={note.id}>
          <div className="memo-card-main">
            <div className="memo-card-title"><strong>{profile?.display_name ?? profile?.username ?? "공통 메모"}</strong><span className={note.read_by_me ? "support-status status-answered" : "support-status status-open"}>{note.read_by_me ? "확인함" : "미확인"}</span></div>
            <p>{note.note}</p>
            <div className="memo-card-meta"><span>작성자 {creator?.display_name ?? creator?.username ?? "관리자"}</span><span>{formatDateTime(note.created_at)}</span><span>확인 {Number(note.read_count ?? 0).toLocaleString()}명</span></div>
            {currentAdmin.role === "SUPER_ADMIN" && Array.isArray(note.read_list) && note.read_list.length > 0 && <div className="memo-read-list compact">{note.read_list.slice(0, 6).map((row: any) => <span key={`${note.id}-${row.admin_id}`}>{personName(row.admin, String(row.admin_id))}</span>)}</div>}
          </div>
          <div className="memo-card-actions">
            <button className="btn btn-primary btn-sm" type="button" onClick={() => toggleAck(note)} disabled={loading === `ack-${note.id}`}><CheckCircle2 size={14} /> {note.read_by_me ? "확인 취소" : "확인"}</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelectedNote(note)}><Eye size={14} /> 상세</button>
            <button className="btn btn-danger btn-sm" type="button" onClick={() => remove("delete-note", note.id, "메모를 삭제했습니다.")} disabled={loading === note.id}><Trash2 size={14} /> 삭제</button>
          </div>
        </article>;
      }) : <div className="empty">메모가 없습니다.</div>}</div>
    </section>

    <section className="panel panel-pad"><h2 className="panel-title">최근 회의록</h2><div className="memo-card-list mt-2">{liveData.meetings.length ? liveData.meetings.map((meeting) => <article className="memo-card" key={meeting.id}><div className="memo-card-main"><strong>{meeting.title}</strong><p>{meeting.body}</p><div className="memo-card-meta"><span>결정 사항: {meeting.decisions ?? "-"}</span><span>{formatDateTime(meeting.created_at)}</span></div></div><div className="memo-card-actions"><button className="btn btn-danger btn-sm" type="button" onClick={() => remove("delete-meeting", meeting.id, "회의록을 삭제했습니다.")} disabled={loading === meeting.id}><Trash2 size={14} /> 삭제</button></div></article>) : <div className="empty">회의록이 없습니다.</div>}</div></section>

    {selectedNote && <NoteDetailModal note={selectedNote} currentAdmin={currentAdmin} onClose={() => setSelectedNote(null)} onAck={toggleAck} onDelete={(note) => remove("delete-note", note.id, "메모를 삭제했습니다.")} loading={loading} />}
  </div>;
}
