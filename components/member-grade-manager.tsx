"use client";

import { LoaderCircle, Plus, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { displayLoginId } from "@/lib/identity";

type Member = { id: string; display_name: string; username?: string | null; email?: string | null; member_code?: string | null; role: string; status: string };
type Tier = { id: string; name: string; description: string | null; label_color: string | null; can_use_community: boolean; is_active: boolean; sort_order: number };
type Assignment = { profile_id: string; tier_id: string; profiles?: Member | Member[] | null; member_tiers?: Tier | Tier[] | null };

async function postJson(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/member-grades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

function relation<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] : value; }
function memberLabel(member: Member) { return `${member.display_name} · ${displayLoginId(member as never)}${member.member_code ? ` · ${member.member_code}` : ""}`; }

export function MemberGradeManager({ members, tiers, assignments }: { members: Member[]; tiers: Tier[]; assignments: Assignment[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const filteredMembers = useMemo(() => members.filter((member) => !query || memberLabel(member).toLowerCase().includes(query.toLowerCase())), [members, query]);

  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    try { setLoading(action); await postJson({ action, ...Object.fromEntries(new FormData(form).entries()) }); window.alert(success); form.reset(); router.refresh(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "처리하지 못했습니다."); }
    finally { setLoading(null); }
  }

  async function action(body: Record<string, unknown>, success: string) {
    try { setLoading(String(body.action)); await postJson(body); window.alert(success); router.refresh(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "처리하지 못했습니다."); }
    finally { setLoading(null); }
  }

  return <div className="grid gap-3 member-grade-mobile">
    <section className="panel panel-pad"><div className="flex items-center gap-1"><ShieldCheck size={19} className="text-gold" /><h2 className="panel-title mb-0">회원 등급 관리</h2></div><p className="panel-description mt-1">관리자 권한과 별개로 일반 회원 등급을 만들고, 커뮤니티 사용 가능 등급을 지정합니다.</p></section>
    <div className="grid grid-2">
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-tier", "회원 등급을 만들었습니다.")}>
        <h2 className="panel-title">등급 만들기</h2>
        <div className="form-row"><div className="field"><label>등급명</label><input className="input" name="name" defaultValue="일반" required /></div><div className="field"><label>색상</label><input className="input" name="labelColor" defaultValue="#2563eb" /></div></div>
        <div className="field"><label>설명</label><input className="input" name="description" placeholder="예: 커뮤니티 사용 가능 일반 등급" /></div>
        <div className="form-row"><label className="checkbox-row"><input type="checkbox" name="canUseCommunity" defaultChecked /> 커뮤니티 사용 가능</label><div className="field"><label>정렬</label><input className="input" name="sortOrder" type="number" defaultValue="10" /></div></div>
        <button className="btn btn-primary" disabled={loading === "create-tier"}>{loading === "create-tier" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 등급 만들기</button>
      </form>
      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "assign-tier", "회원 등급을 배정했습니다.")}>
        <h2 className="panel-title">회원에게 등급 배정</h2>
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="회원 검색" />
        <div className="field"><label>회원</label><select className="select" name="profileId">{filteredMembers.map((member) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}</select></div>
        <div className="field"><label>등급</label><select className="select" name="tierId">{tiers.filter((tier) => tier.is_active).map((tier) => <option key={tier.id} value={tier.id}>{tier.name}{tier.can_use_community ? " · 커뮤니티 가능" : ""}</option>)}</select></div>
        <button className="btn btn-primary" disabled={loading === "assign-tier"}>{loading === "assign-tier" ? <LoaderCircle size={17} className="spin" /> : <UserCheck size={17} />} 등급 배정</button>
      </form>
    </div>
    <section className="panel panel-pad"><h2 className="panel-title">등급 현황</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>등급</th><th>커뮤니티</th><th>상태</th><th>관리</th></tr></thead><tbody>{tiers.length ? tiers.map((tier) => <tr key={tier.id}><td><strong style={{ color: tier.label_color ?? undefined }}>{tier.name}</strong><div className="text-muted text-small">{tier.description ?? "설명 없음"}</div></td><td>{tier.can_use_community ? "가능" : "불가"}</td><td>{tier.is_active ? "사용" : "정지"}</td><td><div className="table-actions"><button className="btn btn-secondary btn-sm" onClick={() => action({ action: "toggle-tier", id: tier.id, isActive: !tier.is_active }, "상태를 변경했습니다.")}>{tier.is_active ? "정지" : "복구"}</button><button className="btn btn-danger btn-sm" onClick={() => action({ action: "delete-tier", id: tier.id }, "등급을 삭제했습니다.")}><Trash2 size={14} /> 삭제</button></div></td></tr>) : <tr><td colSpan={4}><div className="empty">등급이 없습니다.</div></td></tr>}</tbody></table></div></section>
    <section className="panel panel-pad"><h2 className="panel-title">회원별 등급</h2><div className="table-wrap mt-2"><table className="table"><thead><tr><th>회원</th><th>등급</th><th>관리</th></tr></thead><tbody>{assignments.length ? assignments.map((row) => { const member = relation(row.profiles); const tier = relation(row.member_tiers); return <tr key={`${row.profile_id}-${row.tier_id}`}><td>{member?.display_name ?? row.profile_id}<div className="text-muted text-small">{member ? displayLoginId(member as never) : ""}</div></td><td>{tier?.name ?? row.tier_id}</td><td><button className="btn btn-danger btn-sm" onClick={() => action({ action: "remove-assignment", profileId: row.profile_id }, "등급을 해제했습니다.")}>해제</button></td></tr>; }) : <tr><td colSpan={3}><div className="empty">등급이 배정된 회원이 없습니다.</div></td></tr>}</tbody></table></div></section>
  </div>;
}
