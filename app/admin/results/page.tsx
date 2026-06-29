import type { Metadata } from "next";
import { ResultActions } from "@/components/result-actions";
import { requireAdmin } from "@/lib/auth";
import { getAdminResults } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "결과 관리" };
export const dynamic = "force-dynamic";

interface ResultRow {
  id: string;
  created_at: string;
  revealed_at: string | null;
  voided_at: string | null;
  void_reason?: string | null;
  public_display_name?: string | null;
  public_member_code?: string | null;
  draws?: { name?: string } | Array<{ name?: string }> | null;
  rewards?: { name?: string; color?: string } | Array<{ name?: string; color?: string }> | null;
  profiles?: { display_name?: string; member_code?: string } | Array<{ display_name?: string; member_code?: string }> | null;
}

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminResultsPage() {
  const admin = await requireAdmin("VIEWER");
  const results = await getAdminResults(300) as ResultRow[];

  return <>
    <div className="admin-toolbar">
      <div>
        <h1>추첨 결과 관리</h1>
        <p className="text-muted">결과 공개와 무효 처리를 관리합니다. 관계 연결이 깨져도 결과 ID 기준으로 안전하게 표시합니다.</p>
      </div>
    </div>
    <section className="panel panel-pad">
      <div className="table-wrap admin-mobile-table">
        <table className="table">
          <thead>
            <tr><th>시간</th><th>뽑기</th><th>회원</th><th>결과</th><th>상태</th><th>처리</th></tr>
          </thead>
          <tbody>
            {results.length ? results.map((row) => {
              const draw = one(row.draws);
              const reward = one(row.rewards);
              const profile = one(row.profiles);
              return <tr key={row.id}>
                <td data-label="시간" className="muted">{formatDateTime(row.created_at)}</td>
                <td data-label="뽑기">{draw?.name ?? "-"}</td>
                <td data-label="회원"><strong>{profile?.display_name ?? row.public_display_name ?? "참가자"}</strong><div className="text-muted text-small">{profile?.member_code ?? row.public_member_code ?? "-"}</div></td>
                <td data-label="결과"><strong style={{ color: reward?.color ?? "#111827" }}>{reward?.name ?? "-"}</strong></td>
                <td data-label="상태">{row.voided_at ? <span className="badge badge-ended">무효</span> : row.revealed_at ? <span className="badge badge-approved">공개</span> : <span className="badge badge-pending">연출 중</span>}</td>
                <td data-label="처리"><ResultActions resultId={row.id} revealed={Boolean(row.revealed_at)} voided={Boolean(row.voided_at)} canReveal={["MANAGER", "SUPER_ADMIN"].includes(admin.role)} canVoid={admin.role === "SUPER_ADMIN"} /></td>
              </tr>;
            }) : <tr><td colSpan={6}><div className="empty">표시할 추첨 결과가 없습니다. 결과가 있는데 비어 보이면 Supabase SQL 핫픽스를 다시 실행해 주세요.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}
