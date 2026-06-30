import type { Metadata } from "next";
import Link from "next/link";
import { BulkMemberTable } from "@/components/bulk-member-table";
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
  const members = allMembers.filter((member) => {
    const matchesText = !query || [member.display_name, displayLoginId(member), member.member_code ?? ""].some((value) => value.toLowerCase().includes(query));
    const matchesStatus = !status || member.status === status;
    const matchesLoginState = !loginState || member.login_state === loginState;
    return matchesText && matchesStatus && matchesLoginState;
  });

  return (
    <>
      <section className="hero-card compact">
        <div>
          <p className="eyebrow">회원 운영</p>
          <h1>회원 관리</h1>
          <p>가입 승인, 이용정지, 정지 해제를 처리합니다. CS매니저는 일반 회원 상태 처리만 가능합니다.</p>
        </div>
        <Link className="btn btn-secondary" href="/admin/secret-codes">가입 시크릿코드</Link>
      </section>

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

      <BulkMemberTable members={members} currentAdmin={currentAdmin} />
    </>
  );
}
