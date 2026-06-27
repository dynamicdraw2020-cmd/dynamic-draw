"use client";

import { CheckSquare, LoaderCircle, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MemberActions } from "@/components/member-actions";
import { RoleManager } from "@/components/role-manager";
import { StatusBadge } from "@/components/status-badge";
import { displayLoginId } from "@/lib/identity";
import type { Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function BulkMemberTable({ members, currentAdmin }: { members: Profile[]; currentAdmin: Profile }) {
  const router = useRouter();
  const pendingIds = useMemo(() => members.filter((member) => member.status === "PENDING" && member.role === "USER" && member.id !== currentAdmin.id).map((member) => member.id), [members, currentAdmin.id]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectedPending = selected.filter((id) => pendingIds.includes(id));
  const allSelected = pendingIds.length > 0 && selectedPending.length === pendingIds.length;

  function toggle(id: string) {
    setSelected((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  function toggleAll() {
    setSelected((value) => allSelected ? value.filter((id) => !pendingIds.includes(id)) : Array.from(new Set([...value, ...pendingIds])));
  }


  async function deleteNonSuperAdmins() {
    if (currentAdmin.role !== "SUPER_ADMIN") return window.alert("전체 회원 삭제는 최고 관리자만 가능합니다.");
    const deletableCount = members.filter((member) => member.role !== "SUPER_ADMIN" && member.id !== currentAdmin.id && member.status !== "DELETED").length;
    if (!deletableCount) return window.alert("삭제할 회원이 없습니다.");
    const confirmText = window.prompt(`총 관리자 제외 ${deletableCount.toLocaleString()}명을 삭제 처리합니다. 계속하려면 DELETE를 입력해 주세요.`);
    if (confirmText !== "DELETE") return;
    const reason = window.prompt("삭제 사유를 입력해 주세요.")?.trim();
    if (!reason) return;
    setBulkDeleting(true);
    try {
      const response = await fetch("/api/admin/members/bulk-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "전체 회원 삭제에 실패했습니다.");
      window.alert(`삭제 처리 완료: ${body.data?.deletedCount ?? deletableCount}명`);
      setSelected([]);
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function approveSelected() {
    if (!selectedPending.length) return window.alert("승인할 대기 회원을 선택해 주세요.");
    if (!window.confirm(`선택한 ${selectedPending.length}명을 일괄 승인하고 고유 ID를 자동 발급할까요?`)) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/members/bulk-approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberIds: selectedPending }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "일괄 승인하지 못했습니다.");
      window.alert(`일괄 승인 완료: ${body.data?.approvedCount ?? selectedPending.length}명`);
      setSelected([]);
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return <>
    <section className="panel bulk-member-bar">
      <div>
        <strong>일괄 회원 승인</strong>
        <span>승인 대기 회원을 체크박스로 선택해 한 번에 처리합니다.</span>
      </div>
      <div className="table-actions">
        <button className="btn btn-secondary" type="button" onClick={toggleAll} disabled={!pendingIds.length}>{allSelected ? <CheckSquare size={16} /> : <Square size={16} />} 대기 회원 전체 선택</button>
        <button className="btn btn-success" type="button" onClick={approveSelected} disabled={loading || !selectedPending.length}>{loading ? <LoaderCircle size={16} className="spin" /> : <CheckSquare size={16} />} 선택 {selectedPending.length}명 승인</button>{currentAdmin.role === "SUPER_ADMIN" && <button className="btn btn-danger" type="button" onClick={deleteNonSuperAdmins} disabled={bulkDeleting}>{bulkDeleting ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />} 총 관리자 제외 전체 삭제</button>}
      </div>
    </section>
    <div className="table-wrap mt-3"><table className="table"><thead><tr><th style={{ width: 46 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="승인 대기 회원 전체 선택" /></th><th>회원</th><th>아이디</th><th>고유 ID</th><th>상태</th><th>권한</th><th>신청일</th><th>처리</th></tr></thead><tbody>{members.length ? members.map((member) => {
      const canBulkSelect = member.status === "PENDING" && member.role === "USER" && member.id !== currentAdmin.id;
      return <tr key={member.id}><td><input type="checkbox" disabled={!canBulkSelect} checked={selected.includes(member.id)} onChange={() => toggle(member.id)} aria-label={`${member.display_name} 선택`} /></td><td><strong>{member.display_name}</strong><div className="text-muted text-small">개인정보 최소 수집 계정</div></td><td className="muted">{displayLoginId(member)}</td><td><span className="code">{member.member_code ?? "미발급"}</span></td><td><StatusBadge status={member.status} /></td><td><RoleManager memberId={member.id} role={member.role} canManage={currentAdmin.role === "SUPER_ADMIN"} /></td><td className="muted">{formatDateTime(member.created_at)}</td><td><MemberActions memberId={member.id} status={member.status} memberCode={member.member_code} canManage={member.id !== currentAdmin.id && (member.role === "USER" || currentAdmin.role === "SUPER_ADMIN")} /></td></tr>;
    }) : <tr><td colSpan={8}><div className="empty">조건에 맞는 회원이 없습니다.</div></td></tr>}</tbody></table></div>
  </>;
}
