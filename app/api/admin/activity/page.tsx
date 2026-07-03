import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Coins, Gift, Ticket } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAdminMembers, getAdminUserActivityData } from "@/lib/data";
import { displayLoginId } from "@/lib/identity";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "유저 활동 로그" };
export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }

export default async function AdminUserActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("VIEWER");
  const params = await searchParams;
  const memberId = first(params.memberId);
  const members = (await getAdminMembers()).filter((member) => member.status === "APPROVED");
  const selectedMemberId = memberId || members[0]?.id || "";
  const data = await getAdminUserActivityData(selectedMemberId);
  return <>
    <div className="admin-toolbar"><div><h1>유저 활동 로그</h1><p className="text-muted">회원별 추첨권, 화폐, 보유 상품, 교환·사용 내역을 한 화면에서 확인합니다.</p></div></div>
    <form className="panel panel-pad form-grid" method="get">
      <div className="field"><label htmlFor="memberId">회원 선택</label><select className="select" id="memberId" name="memberId" defaultValue={selectedMemberId}>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {displayLoginId(member)} · {member.member_code ?? "미승인"}</option>)}</select></div>
      <div className="table-actions"><button className="btn btn-primary" type="submit">활동 조회</button><Link className="btn btn-secondary" href="/admin/members">회원 관리로 이동</Link></div>
    </form>
    {data.profile ? <section className="panel panel-pad mt-3 user-activity-header"><div><strong>{data.profile.display_name}</strong><span>{displayLoginId(data.profile)} · {data.profile.member_code ?? "고유 ID 미발급"}</span></div><div className="badge badge-approved">{data.profile.status}</div></section> : <div className="empty mt-3">선택된 회원이 없습니다.</div>}
    <div className="grid grid-3 mt-3">
      <section className="panel panel-pad"><h2 className="panel-title"><Ticket size={18} /> 보유 추첨권</h2><div className="mini-list">{data.tickets.length ? data.tickets.map((item) => <div key={`${item.profile_id}-${item.draw_id}`}><strong>{item.draw_name}</strong><span>{item.quantity.toLocaleString()}장</span></div>) : <span className="text-muted">보유 추첨권 없음</span>}</div></section>
      <section className="panel panel-pad"><h2 className="panel-title"><Coins size={18} /> 보유 화폐</h2><div className="mini-list">{data.currencies.length ? data.currencies.map((item) => <div key={`${item.profile_id}-${item.currency_id}`}><strong>{item.currency_name}</strong><span>{item.balance.toLocaleString()}{item.currency_symbol}</span></div>) : <span className="text-muted">보유 화폐 없음</span>}</div></section>
      <section className="panel panel-pad"><h2 className="panel-title"><Gift size={18} /> 보유 상품</h2><div className="mini-list">{data.inventory.length ? data.inventory.map((item) => <div key={item.reward_id}><strong>{item.reward_name}</strong><span>{item.quantity.toLocaleString()}개</span></div>) : <span className="text-muted">보유 상품 없음</span>}</div></section>
    </div>
    <section className="panel panel-pad mt-3"><h2 className="panel-title"><ClipboardList size={18} /> 활동 내역</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>시간</th><th>구분</th><th>내용</th><th>원본 로그</th></tr></thead><tbody>{data.activities.length ? data.activities.map((item) => <tr key={item.id}><td className="muted">{formatDateTime(item.created_at)}</td><td><strong>{item.title}</strong></td><td>{item.description}</td><td className="muted">{item.action}</td></tr>) : <tr><td colSpan={4}><div className="empty">아직 표시할 활동 로그가 없습니다. 앞으로 지급·사용·교환 내역이 쌓이면 이곳에 표시됩니다.</div></td></tr>}</tbody></table></div></section>
  </>;
}
