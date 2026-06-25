import type { Metadata } from "next";
import { ResultActions } from "@/components/result-actions";
import { requireAdmin } from "@/lib/auth";
import { getAdminResults } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "결과 관리" };

interface ResultRow {
  id: string; created_at: string; revealed_at: string | null; voided_at: string | null; void_reason?: string | null;
  public_display_name?: string | null; public_member_code?: string | null;
  draws?: { name?: string } | Array<{ name?: string }>;
  rewards?: { name?: string; color?: string } | Array<{ name?: string; color?: string }>;
  profiles?: { display_name?: string; member_code?: string } | Array<{ display_name?: string; member_code?: string }>;
}

function one<T>(value: T | T[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function AdminResultsPage() {
  const admin = await requireAdmin("VIEWER");
  const results = await getAdminResults() as ResultRow[];
  return <><div className="admin-toolbar"><div><h1>추첨 결과 관리</h1><p className="text-muted">완전 삭제 대신 무효 처리하여 감사 가능성을 보존합니다.</p></div></div><div className="table-wrap"><table className="table"><thead><tr><th>시간</th><th>뽑기</th><th>회원</th><th>결과</th><th>상태</th><th>처리</th></tr></thead><tbody>{results.map((row) => { const draw = one(row.draws); const reward = one(row.rewards); const profile = one(row.profiles); return <tr key={row.id}><td className="muted">{formatDateTime(row.created_at)}</td><td>{draw?.name ?? "-"}</td><td><strong>{profile?.display_name ?? row.public_display_name ?? "참가자"}</strong><div className="text-muted text-small">{profile?.member_code ?? row.public_member_code}</div></td><td><strong style={{ color: reward?.color ?? "#fff" }}>{reward?.name ?? "-"}</strong></td><td>{row.voided_at ? <span className="badge badge-ended">무효</span> : row.revealed_at ? <span className="badge badge-approved">공개</span> : <span className="badge badge-pending">연출 중</span>}</td><td><ResultActions resultId={row.id} revealed={Boolean(row.revealed_at)} voided={Boolean(row.voided_at)} canReveal={["MANAGER", "SUPER_ADMIN"].includes(admin.role)} canVoid={admin.role === "SUPER_ADMIN"} /></td></tr>; })}</tbody></table></div></>;
}
