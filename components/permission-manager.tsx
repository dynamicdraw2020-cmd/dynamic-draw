/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { displayLoginId } from "@/lib/identity";

const permissionItems = [
  ["members", "회원 관리"],
  ["events", "공지·이벤트"],
  ["draws", "뽑기·추첨"],
  ["rewards", "보상·화폐"],
  ["stats", "통계 조회"],
  ["support", "고객센터"],
  ["delete", "삭제/무효 처리"],
  ["settings", "사이트 설정"],
] as const;

type Data = { profiles: Array<Record<string, any>>; sets: Array<Record<string, any>>; assignments: Array<Record<string, any>> };

async function postPermission(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/permissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function PermissionManager({ data }: { data: Data }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const permissions = Object.fromEntries(permissionItems.map(([key]) => [key, formData.get(key) === "on"]));
    const payload = { action, ...Object.fromEntries(formData.entries()), permissions };
    try { setLoading(action); setMessage(null); await postPermission(payload); setMessage({ type: "success", text: success }); form.reset(); router.refresh(); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." }); }
    finally { setLoading(null); }
  }
  return <div className="grid gap-3">
    {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
    <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-set", "권한 세트를 저장했습니다.")}>
      <div className="flex items-center gap-1"><ShieldCheck size={19} className="text-gold" /><h2 className="panel-title mb-0">권한 세트 만들기</h2></div>
      <div className="form-row"><div className="field"><label>권한명</label><input className="input" name="name" defaultValue="이벤트 관리자" /></div><div className="field"><label>설명</label><input className="input" name="description" placeholder="권한 설명" /></div></div>
      <div className="grid grid-4">{permissionItems.map(([key, label]) => <label className="check-row" key={key}><input type="checkbox" name={key} /> {label}</label>)}</div>
      <button className="btn btn-primary" disabled={loading === "create-set"}>{loading === "create-set" ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />} 권한 세트 저장</button>
    </form>
    <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "assign-set", "관리자에게 권한을 배정했습니다.")}>
      <h2 className="panel-title">관리자 권한 배정</h2>
      <div className="form-row"><div className="field"><label>관리자</label><select className="select" name="profileId">{data.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name} · {displayLoginId(profile)} · {profile.role}</option>)}</select></div><div className="field"><label>권한 세트</label><select className="select" name="setId">{data.sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select></div></div>
      <button className="btn btn-primary" disabled={loading === "assign-set"}>권한 배정</button>
    </form>
    <section className="panel panel-pad"><h2 className="panel-title">권한 세트 현황</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>권한명</th><th>권한</th><th>상태</th></tr></thead><tbody>{data.sets.length ? data.sets.map((set) => <tr key={set.id}><td><strong>{set.name}</strong><div className="text-muted text-small">{set.description ?? "설명 없음"}</div></td><td>{Object.entries(set.permissions ?? {}).filter(([, value]) => value).map(([key]) => key).join(", ") || "권한 없음"}</td><td>{set.is_active ? "사용" : "정지"}</td></tr>) : <tr><td colSpan={3}><div className="empty">권한 세트가 없습니다.</div></td></tr>}</tbody></table></div></section>
  </div>;
}
