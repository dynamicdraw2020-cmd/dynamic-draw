import type { Metadata } from "next";
import Link from "next/link";
import { MemberActions } from "@/components/member-actions";
import { RoleManager } from "@/components/role-manager";
import { StatusBadge } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth";
import { getAdminMembers } from "@/lib/data";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "회원 관리" };

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const currentAdmin = await requireAdmin("MANAGER");
  const params = await searchParams;
  const query = first(params.q).trim().toLowerCase();
  const status = first(params.status);
  const allMembers = await getAdminMembers();
  const members = allMembers.filter((member) => {
    const matchesText = !query || [member.display_name, displayLoginId(member), member.member_code ?? ""].some((value) => value.toLowerCase().includes(query));
    const matchesStatus = !status || member.status === status;
    return matchesText && matchesStatus;
  });

  return <>
    <div className="admin-toolbar"><div><h1>회원 관리</h1><p className="text-muted">가입 신청을 승인하면 서버가 중복되지 않는 고유 ID를 자동 발급합니다.</p></div></div>
    <div className="warning-box">고유 ID는 교환·결과·보유 상품을 연결하는 운영 번호입니다. 승인 뒤 회원에게 알려 주세요.</div>
    <form className="panel panel-pad form-grid mt-3" method="get">
      <div className="form-row">
        <div className="field"><label htmlFor="member-query">회원 검색</label><input className="input" id="member-query" name="q" defaultValue={first(params.q)} placeholder="이름, 아이디, 고유 ID" /></div>
        <div className="field"><label htmlFor="member-status">상태</label><select className="select" id="member-status" name="status" defaultValue={status}><option value="">전체 상태</option><option value="PENDING">승인 대기</option><option value="APPROVED">승인</option><option value="REJECTED">반려</option><option value="SUSPENDED">정지</option></select></div>
      </div>
      <div className="table-actions"><button className="btn btn-primary" type="submit">검색</button><Link className="btn btn-secondary" href="/admin/members">초기화</Link><span className="text-muted text-small">검색 결과 {members.length.toLocaleString()}명 / 전체 {allMembers.length.toLocaleString()}명</span></div>
    </form>
    <div className="table-wrap mt-3"><table className="table"><thead><tr><th>회원</th><th>아이디</th><th>고유 ID</th><th>상태</th><th>권한</th><th>신청일</th><th>처리</th></tr></thead><tbody>{members.length ? members.map((member) => <tr key={member.id}><td><strong>{member.display_name}</strong><div className="text-muted text-small">개인정보 최소 수집 계정</div></td><td className="muted">{displayLoginId(member)}</td><td><span className="code">{member.member_code ?? "미발급"}</span></td><td><StatusBadge status={member.status} /></td><td><RoleManager memberId={member.id} role={member.role} canManage={currentAdmin.role === "SUPER_ADMIN"} /></td><td className="muted">{formatDateTime(member.created_at)}</td><td><MemberActions memberId={member.id} status={member.status} memberCode={member.member_code} canManage={member.id !== currentAdmin.id && (member.role === "USER" || currentAdmin.role === "SUPER_ADMIN")} /></td></tr>) : <tr><td colSpan={7}><div className="empty">조건에 맞는 회원이 없습니다.</div></td></tr>}</tbody></table></div>
  </>;
}
