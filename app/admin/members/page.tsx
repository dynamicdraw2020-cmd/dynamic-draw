import type { Metadata } from "next";
import Link from "next/link";
import { BulkMemberTable } from "@/components/bulk-member-table";
import { RejectedMembersCleanup } from "@/components/rejected-members-cleanup";
import { requireAdminCapability } from "@/lib/auth";
import { getAdminMembers } from "@/lib/data";
import { displayLoginId } from "@/lib/identity";

export const metadata: Metadata = { title: "회원 관리" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const currentAdmin = await requireAdminCapability("MEMBER_STATUS");
  const params = await searchParams;
  const query = first(params.q).trim().toLowerCase();
  const status = first(params.status);
  const loginState = first(params.loginState);
  const allMembers = await getAdminMembers();
  const rejectedMemberCount = allMembers.filter((member) => member.status === "REJECTED" && member.role === "USER" && member.id !== currentAdmin.id).length;
  const members = allMembers.filter((member) => {
    const matchesText = !query || [member.display_name, displayLoginId(member), member.member_code ?? ""].some((value) => value.toLowerCase().includes(query));
    const matchesStatus = status ? member.status === status : member.status !== "DELETED";
    const matchesLoginState = !loginState || member.login_state === loginState;
    return matchesText && matchesStatus && matchesLoginState;
  });

  return (
    <>
      <form className="panel panel-pad filter-grid" action="/admin/members">
        <label>
          회원 검색
          <input className="input" name="q" defaultValue={query} placeholder="닉네임, 아이디, 고유 ID" />
        </label>
        <label>
          상태
          <select className="select" name="status" defaultValue={status}>
            <option value="">전체 상태</option>
            <option value="PENDING">승인 대기</option>
            <option value="APPROVED">승인</option>
            <option value="REJECTED">반려</option>
            <option value="SUSPENDED">정지</option>
            <option value="DELETED">삭제 처리</option>
          </select>
        </label>
        <label>
          접속 상태
          <select className="select" name="loginState" defaultValue={loginState}>
            <option value="">전체</option>
            <option value="ONLINE">온라인</option>
            <option value="OFFLINE">오프라인</option>
            <option value="TRYING">로그인 시도</option>
            <option value="FAILED">실패 기록</option>
          </select>
        </label>
        <div className="table-actions">
          <Link className="btn btn-secondary" href="/admin/members">초기화</Link>
          <button className="btn btn-primary">검색</button>
        </div>
        <p className="muted">검색 결과 {members.length.toLocaleString()}명 / 전체 {allMembers.length.toLocaleString()}명</p>
      </form>

      <RejectedMembersCleanup currentAdminRole={currentAdmin.role} rejectedMemberCount={rejectedMemberCount} />

      <BulkMemberTable members={members} currentAdmin={currentAdmin} rejectedMemberCount={rejectedMemberCount} />
    </>
  );
}
