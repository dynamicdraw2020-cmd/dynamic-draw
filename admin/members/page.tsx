import type { Metadata } from "next";
import Link from "next/link";
import { BulkMemberTable } from "@/components/bulk-member-table";
import { requireAdmin } from "@/lib/auth";
import { getAdminMembers } from "@/lib/data";
import { displayLoginId } from "@/lib/identity";

export const metadata: Metadata = { title: "회원 관리" };

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const currentAdmin = await requireAdmin("MANAGER");
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

  return <>
    <div className="admin-toolbar"><div><h1>회원 관리</h1><p className="text-muted">가입 신청을 승인하면 서버가 중복되지 않는 고유 ID를 자동 발급합니다.</p></div></div>
    <div className="warning-box">고유 ID는 교환·결과·보유 상품을 연결하는 운영 번호입니다. 승인 뒤 회원에게 알려 주세요.</div>
    <form className="panel panel-pad form-grid mt-3" method="get">
      <div className="form-row">
        <div className="field"><label htmlFor="member-query">회원 검색</label><input className="input" id="member-query" name="q" defaultValue={first(params.q)} placeholder="이름, 아이디, 고유 ID" /></div>
        <div className="field"><label htmlFor="member-status">상태</label><select className="select" id="member-status" name="status" defaultValue={status}><option value="">전체 상태</option><option value="PENDING">승인 대기</option><option value="APPROVED">승인</option><option value="REJECTED">반려</option><option value="SUSPENDED">정지</option></select></div><div className="field"><label htmlFor="login-state">접속 상태</label><select className="select" id="login-state" name="loginState" defaultValue={loginState}><option value="">전체</option><option value="ONLINE">온라인</option><option value="OFFLINE">오프라인</option><option value="TRYING">로그인 시도</option><option value="FAILED">실패 기록</option></select></div>
      </div>
      <div className="table-actions"><button className="btn btn-primary" type="submit">검색</button><Link className="btn btn-secondary" href="/admin/members">초기화</Link><span className="text-muted text-small">검색 결과 {members.length.toLocaleString()}명 / 전체 {allMembers.length.toLocaleString()}명</span></div>
    </form>
    <BulkMemberTable members={members} currentAdmin={currentAdmin} />
  </>;
}
