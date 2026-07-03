"use client";

import { CheckSquare, KeyRound, LoaderCircle, RotateCcw, ShieldBan, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MemberActions } from "@/components/member-actions";
import { clientJsonRequest } from "@/lib/client-fetch";
import { RoleManager } from "@/components/role-manager";
import { StatusBadge } from "@/components/status-badge";
import { displayLoginId } from "@/lib/identity";
import type { Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function canManageMember(currentAdmin: Profile, member: Profile) {
  if (member.id === currentAdmin.id) return false;
  if (currentAdmin.role === "SUPER_ADMIN") return true;
  return member.role === "USER";
}

export function BulkMemberTable({
  members,
  currentAdmin,
  rejectedMemberCount = 0,
}: {
  members: Profile[];
  currentAdmin: Profile;
  rejectedMemberCount?: number;
}) {
  const router = useRouter();
  const pendingIds = useMemo(
    () => members.filter((member) => member.status === "PENDING" && member.role === "USER" && member.id !== currentAdmin.id).map((member) => member.id),
    [members, currentAdmin.id],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkSuspending, setBulkSuspending] = useState(false);
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [bulkPasswordResetting, setBulkPasswordResetting] = useState(false);

  const selectedPending = selected.filter((id) => pendingIds.includes(id));
  const allSelected = pendingIds.length > 0 && selectedPending.length === pendingIds.length;

  function toggle(id: string) {
    setSelected((value) => (value.includes(id) ? value.filter((item) => item !== id) : [...value, id]));
  }

  function toggleAll() {
    setSelected((value) => (allSelected ? value.filter((id) => !pendingIds.includes(id)) : Array.from(new Set([...value, ...pendingIds]))));
  }

  async function jsonPost(url: string, body: unknown) {
    return clientJsonRequest<{ data?: Record<string, unknown> }>(url, {
      method: "POST",
      json: body,
      timeoutMs: 5000,
      fallbackMessage: "처리하지 못했습니다.",
    });
  }

  async function deleteNonSuperAdmins() {
    if (currentAdmin.role !== "SUPER_ADMIN") return window.alert("전체 회원 삭제는 최고 관리자만 가능합니다.");
    const deletableCount = members.filter((member) => member.role !== "SUPER_ADMIN" && member.id !== currentAdmin.id && member.status !== "DELETED").length;
    if (!deletableCount) return window.alert("삭제할 회원이 없습니다.");
    const confirmText = window.prompt(`총 관리자 제외 ${deletableCount.toLocaleString()}명을 삭제 처리합니다.\n계속하려면 DELETE를 입력해 주세요.`);
    if (confirmText !== "DELETE") return;
    const reason = window.prompt("삭제 사유를 입력해 주세요.")?.trim();
    if (!reason) return;
    setBulkDeleting(true);
    try {
      const body = await jsonPost("/api/admin/members/bulk-delete", { reason });
      window.alert(`삭제 처리 완료: ${body.data?.deletedCount ?? deletableCount}명`);
      setSelected([]);
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function suspendAllRegularMembers() {
    if (currentAdmin.role !== "SUPER_ADMIN") return window.alert("전체 이용정지는 최고 관리자만 가능합니다.");
    const count = members.filter((member) => member.role === "USER" && member.status === "APPROVED").length;
    if (!count) return window.alert("이용정지할 승인 일반 회원이 없습니다.");
    const confirmText = window.prompt(`관리자 제외 승인 일반 회원 ${count.toLocaleString()}명을 모두 이용정지합니다.\n계속하려면 SUSPEND를 입력해 주세요.`);
    if (confirmText !== "SUSPEND") return;
    const reason = window.prompt("이용정지 사유를 입력해 주세요.")?.trim();
    if (!reason) return;
    setBulkSuspending(true);
    try {
      const body = await jsonPost("/api/admin/members/bulk-suspend", { reason });
      window.alert(`이용정지 완료: ${body.data?.suspendedCount ?? count}명`);
      setSelected([]);
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setBulkSuspending(false);
    }
  }

  async function resetApprovedPasswords() {
    if (currentAdmin.role !== "SUPER_ADMIN") return window.alert("비밀번호 일괄 초기화는 최고 관리자만 가능합니다.");
    const count = members.filter((member) => member.role !== "SUPER_ADMIN" && member.status === "APPROVED" && member.id !== currentAdmin.id).length;
    if (!count) return window.alert("초기화할 승인 회원이 없습니다.");
    const confirmText = window.prompt(`승인 회원 ${count.toLocaleString()}명의 비밀번호를 공통 임시 비밀번호로 초기화합니다.
계속하려면 RESET을 입력해 주세요.`);
    if (confirmText !== "RESET") return;
    setBulkPasswordResetting(true);
    try {
      const body = await clientJsonRequest<{ data?: { temporaryPassword?: string; succeededCount?: number; failedCount?: number } }>("/api/admin/members/reset-passwords", {
        method: "POST",
        json: { confirm: "RESET", scope: "approved-users", limit: 500 },
        timeoutMs: 30000,
        fallbackMessage: "비밀번호 일괄 초기화에 실패했습니다.",
      });
      window.alert(`초기화 완료: ${body.data?.succeededCount ?? 0}명
실패: ${body.data?.failedCount ?? 0}명
임시 비밀번호: ${body.data?.temporaryPassword ?? "DynamicD2026!reset"}`);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "비밀번호 일괄 초기화에 실패했습니다.");
    } finally {
      setBulkPasswordResetting(false);
    }
  }

  async function restoreAllRegularMembers() {
    if (currentAdmin.role !== "SUPER_ADMIN") return window.alert("전체 이용정지 해지는 최고 관리자만 가능합니다.");
    const count = members.filter((member) => member.role === "USER" && member.status === "SUSPENDED").length;
    if (!count) return window.alert("이용정지 해지할 일반 회원이 없습니다.");
    const confirmText = window.prompt(`관리자 제외 이용정지 일반 회원 ${count.toLocaleString()}명을 승인 상태로 복구합니다.\n계속하려면 RESTORE를 입력해 주세요.`);
    if (confirmText !== "RESTORE") return;
    setBulkRestoring(true);
    try {
      const body = await jsonPost("/api/admin/members/bulk-restore", { reason: "전체 이용정지 해지" });
      window.alert(`이용정지 해지 완료: ${body.data?.restoredCount ?? count}명`);
      setSelected([]);
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setBulkRestoring(false);
    }
  }

  async function approveSelected() {
    if (!selectedPending.length) return window.alert("승인할 대기 회원을 선택해 주세요.");
    if (!window.confirm(`선택한 ${selectedPending.length}명을 일괄 승인하고 고유 ID를 자동 발급할까요?`)) return;
    setLoading(true);
    try {
      const body = await jsonPost("/api/admin/members/bulk-approve", { memberIds: selectedPending });
      window.alert(`일괄 승인 완료: ${body.data?.approvedCount ?? selectedPending.length}명`);
      setSelected([]);
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel panel-pad">
      <div className="section-head">
        <div>
          <h2 className="panel-title">회원 목록</h2>
          <p className="muted">승인 대기 회원을 체크박스로 선택해 한 번에 처리합니다.</p>
        </div>
        <div className="table-actions">
          <button className="btn btn-secondary" type="button" onClick={toggleAll} disabled={!pendingIds.length}>
            {allSelected ? <CheckSquare size={16} /> : <Square size={16} />} 대기 회원 전체 선택
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void approveSelected()} disabled={loading || !selectedPending.length}>
            {loading ? <LoaderCircle size={16} className="spin" /> : <CheckSquare size={16} />} 선택 {selectedPending.length}명 승인
          </button>
          {currentAdmin.role === "SUPER_ADMIN" && (
            <button className="btn btn-secondary" type="button" onClick={() => void resetApprovedPasswords()} disabled={bulkPasswordResetting}>
              {bulkPasswordResetting ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />} 승인 회원 임시비번 적용
            </button>
          )}
          {currentAdmin.role === "SUPER_ADMIN" && (
            <button className="btn btn-secondary" type="button" onClick={() => void restoreAllRegularMembers()} disabled={bulkRestoring}>
              {bulkRestoring ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />} 일반 회원 정지 해지
            </button>
          )}
          {currentAdmin.role === "SUPER_ADMIN" && (
            <button className="btn btn-secondary" type="button" onClick={() => void suspendAllRegularMembers()} disabled={bulkSuspending}>
              {bulkSuspending ? <LoaderCircle size={16} className="spin" /> : <ShieldBan size={16} />} 일반 회원 전체 정지
            </button>
          )}
          {currentAdmin.role === "SUPER_ADMIN" && (
            <button className="btn btn-danger" type="button" onClick={() => void deleteNonSuperAdmins()} disabled={bulkDeleting}>
              {bulkDeleting ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />} 총 관리자 제외 전체 삭제
            </button>
          )}
        </div>
      </div>

      <div className="table-wrap mt-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>선택</th>
              <th>회원</th>
              <th>아이디</th>
              <th>고유 ID</th>
              <th>상태</th>
              <th>접속/위험</th>
              <th>권한</th>
              <th>신청일</th>
              <th>처리</th>
            </tr>
          </thead>
          <tbody>
            {members.length ? (
              members.map((member) => {
                const canBulkSelect = member.status === "PENDING" && member.role === "USER" && member.id !== currentAdmin.id;
                const riskScore = Number(member.duplicate_risk_score ?? 0);
                const riskClass = riskScore >= 60 ? "risk-high" : riskScore >= 30 ? "risk-mid" : "risk-low";
                return (
                  <tr key={member.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(member.id)}
                        disabled={!canBulkSelect}
                        onChange={() => toggle(member.id)}
                        aria-label={`${member.display_name} 선택`}
                      />
                    </td>
                    <td>
                      <strong>{member.display_name}</strong>
                      <br />
                      <small>{member.must_change_password ? "임시 비밀번호 사용 중" : "개인정보 최소 수집 계정"}</small>
                    </td>
                    <td>{displayLoginId(member)}</td>
                    <td>{member.member_code ?? "미발급"}</td>
                    <td><StatusBadge status={member.status} /></td>
                    <td>
                      <span>{member.login_state === "ONLINE" ? "온라인" : member.login_state === "TRYING" ? "로그인 시도" : member.login_state === "FAILED" ? "실패 기록" : "오프라인"}</span>
                      <br />
                      <small className={riskClass}>중복위험 {riskScore}점</small>
                      {Array.isArray(member.duplicate_risk_flags) && member.duplicate_risk_flags.length > 0 && (
                        <small> · {member.duplicate_risk_flags.slice(0, 2).join(" · ")}</small>
                      )}
                    </td>
                    <td>
                      <RoleManager memberId={member.id} role={member.role} canManage={currentAdmin.role === "SUPER_ADMIN" && member.id !== currentAdmin.id} />
                    </td>
                    <td>{formatDateTime(member.created_at)}</td>
                    <td>
                      <MemberActions
                        memberId={member.id}
                        status={member.status}
                        canManage={canManageMember(currentAdmin, member)}
                        adminRole={currentAdmin.role}
                      />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9}>조건에 맞는 회원이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
