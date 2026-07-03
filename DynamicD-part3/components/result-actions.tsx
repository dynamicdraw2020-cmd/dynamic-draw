"use client";

import { Ban, Eye, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResultActions({ resultId, revealed, voided, canReveal, canVoid }: { resultId: string; revealed: boolean; voided: boolean; canReveal: boolean; canVoid: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function call(path: string, body?: unknown) {
    setLoading(true);
    const response = await fetch(path, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return window.alert(data.error?.message ?? "처리하지 못했습니다.");
    router.refresh();
  }

  if (voided) return <span className="badge badge-ended">무효 처리됨</span>;
  if (!canReveal && !canVoid) return <span className="text-muted text-small">조회 전용</span>;
  return (
    <div className="table-actions">
      {!revealed && canReveal && <button className="btn btn-secondary btn-sm" onClick={() => call(`/api/admin/results/${resultId}/reveal`)} disabled={loading}>{loading ? <LoaderCircle size={13} /> : <Eye size={13} />} 공개</button>}
      {revealed && canVoid && <button className="btn btn-danger btn-sm" onClick={() => { const reason = window.prompt("무효 처리 사유를 입력해 주세요."); if (reason) void call(`/api/admin/results/${resultId}/void`, { reason }); }} disabled={loading}><Ban size={13} /> 무효</button>}
    </div>
  );
}
