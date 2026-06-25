"use client";

import { Check, LoaderCircle, ShieldBan, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MemberActions({ memberId, status, canManage = true }: { memberId: string; status: string; memberCode?: string | null; canManage?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function act(type: "approve" | "reject" | "suspend" | "restore") {
    let payload: Record<string, string> = {};
    if (type === "approve" && !window.confirm("이 회원을 승인하고 고유 ID를 자동 발급할까요?")) return;
    if (type === "restore" && !window.confirm("이 회원을 승인 상태로 복구할까요? 고유 ID가 없다면 자동 발급됩니다.")) return;
    if (type === "reject" || type === "suspend") {
      const reason = window.prompt(type === "reject" ? "반려 사유를 입력해 주세요." : "정지 사유를 입력해 주세요.");
      if (!reason) return;
      payload = { reason };
    }
    setLoading(type);
    const response = await fetch(`/api/admin/members/${memberId}/${type}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    setLoading(null);
    if (!response.ok) return window.alert(body.error?.message ?? "처리하지 못했습니다.");
    if (type === "approve") window.alert(`승인 완료 · 고유 ID ${body.data?.member_code ?? "자동 발급"}`);
    router.refresh();
  }

  if (!canManage) return <span className="text-muted text-small">보호된 계정</span>;

  if (status === "PENDING") {
    return (
      <div className="table-actions">
        <button className="btn btn-success btn-sm" onClick={() => act("approve")} disabled={Boolean(loading)}>{loading === "approve" ? <LoaderCircle size={14} className="spin" /> : <><UserRoundCheck size={14} /> 승인·ID 자동발급</>}</button>
        <button className="btn btn-danger btn-sm" onClick={() => act("reject")} disabled={Boolean(loading)}><ShieldBan size={14} /> 반려</button>
      </div>
    );
  }
  if (status === "APPROVED") return <button className="btn btn-danger btn-sm" onClick={() => act("suspend")} disabled={Boolean(loading)}><ShieldBan size={14} /> 이용 정지</button>;
  return <button className="btn btn-secondary btn-sm" onClick={() => act("restore")} disabled={Boolean(loading)}><Check size={14} /> 승인 상태 복구</button>;
}
