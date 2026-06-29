"use client";

import { LoaderCircle, ShieldX } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

type Data = { members: Array<Record<string, any>>; entries: Array<Record<string, any>> };

async function postBlacklist(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/blacklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function BlacklistManager({ data }: { data: Data }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    try { setLoading(action); setMessage(null); await postBlacklist({ action, ...Object.fromEntries(new FormData(form).entries()) }); setMessage({ type: "success", text: success }); form.reset(); router.refresh(); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." }); }
    finally { setLoading(null); }
  }
  async function action(body: Record<string, unknown>, success: string) {
    try { setLoading(String(body.action)); setMessage(null); await postBlacklist(body); setMessage({ type: "success", text: success }); router.refresh(); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." }); }
    finally { setLoading(null); }
  }
  return <div className="grid gap-3">
    {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
    <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "add", "블랙리스트에 등록했습니다.")}>
      <div className="flex items-center gap-1"><ShieldX size={19} className="text-gold" /><h2 className="panel-title mb-0">블랙리스트 등록</h2></div>
      <div className="form-row"><div className="field"><label>회원</label><select className="select" name="profileId">{data.members.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {displayLoginId(member)} · {member.status}</option>)}</select></div><div className="field"><label>제한 범위</label><select className="select" name="scope"><option value="ALL">전체 제한</option><option value="DRAW">추첨 제한</option><option value="EXCHANGE">교환 제한</option><option value="COMMUNITY">커뮤니티 제한</option><option value="LOGIN">로그인 제한</option></select></div></div>
      <div className="field"><label>사유</label><textarea className="textarea" name="reason" rows={4} placeholder="운영 사유를 남겨 주세요." /></div>
      <button className="btn btn-primary" disabled={loading === "add"}>{loading === "add" ? <LoaderCircle size={17} className="spin" /> : <ShieldX size={17} />} 등록</button>
    </form>
    <section className="panel panel-pad"><h2 className="panel-title">블랙리스트 현황</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>회원</th><th>범위</th><th>사유</th><th>상태</th><th>관리</th></tr></thead><tbody>{data.entries.length ? data.entries.map((entry) => { const p = Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles; return <tr key={entry.id}><td>{p?.display_name ?? entry.profile_id}<div className="text-muted text-small">{p?.member_code ?? ""}</div></td><td>{entry.scope}</td><td>{entry.reason}</td><td>{entry.status} · {formatDateTime(entry.created_at)}</td><td>{entry.status === "ACTIVE" ? <button className="btn btn-secondary btn-sm" onClick={() => action({ action: "remove", id: entry.id }, "블랙리스트를 해제했습니다.")}>해제</button> : "해제됨"}</td></tr>; }) : <tr><td colSpan={5}><div className="empty">블랙리스트가 없습니다.</div></td></tr>}</tbody></table></div></section>
  </div>;
}
