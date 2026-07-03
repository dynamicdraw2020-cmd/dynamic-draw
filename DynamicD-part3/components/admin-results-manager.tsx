"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ResultActions } from "@/components/result-actions";
import { formatDateTime } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

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

export function AdminResultsManager({ initialResults, adminRole }: { initialResults: ResultRow[]; adminRole: UserRole }) {
  const [results, setResults] = useState<ResultRow[]>(initialResults);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadResults() {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/results/list?limit=500&ts=${Date.now()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "결과 목록을 불러오지 못했습니다.");
      setResults(body.data?.results ?? []);
      setMessage(`불러온 결과 ${Number(body.data?.count ?? 0).toLocaleString()}개`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결과 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadResults(); }, []);

  return <section className="panel panel-pad">
    <div className="table-topbar">
      <strong>결과 목록</strong>
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => void loadResults()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} /> 새로고침</button>
    </div>
    {message && <div className="form-message form-info mt-2">{message}</div>}
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
              <td data-label="처리"><ResultActions resultId={row.id} revealed={Boolean(row.revealed_at)} voided={Boolean(row.voided_at)} canReveal={["MANAGER", "SUPER_ADMIN"].includes(adminRole)} canVoid={adminRole === "SUPER_ADMIN"} /></td>
            </tr>;
          }) : <tr><td colSpan={6}><div className="empty">표시할 추첨 결과가 없습니다. 홈 최근 결과에는 보이는데 이곳이 비면 SQL 핫픽스를 다시 실행해 주세요.</div></td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
