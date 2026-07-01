"use client";

import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@/lib/types";

async function jsonPost(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "처리하지 못했습니다.");
  return data;
}

export function RejectedMembersCleanup({
  currentAdminRole,
  rejectedMemberCount,
}: {
  currentAdminRole: UserRole;
  rejectedMemberCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (currentAdminRole !== "SUPER_ADMIN") return null;

  async function deleteRejectedMembers() {
    if (!rejectedMemberCount) return window.alert("삭제할 반려 회원이 없습니다.");

    const confirmText = window.prompt(
      `반려 상태의 일반 회원 ${rejectedMemberCount.toLocaleString()}명을 한 번에 삭제 처리합니다.\n` +
      "이 작업은 총관리자만 가능하며, 관리자 계정은 제외됩니다.\n" +
      "계속하려면 DELETE_REJECTED를 정확히 입력해 주세요.",
    );
    if (confirmText !== "DELETE_REJECTED") return;

    const reason = window.prompt("반려 계정 전체 삭제 사유를 입력해 주세요.")?.trim();
    if (!reason) return;

    setLoading(true);
    try {
      const body = await jsonPost("/api/admin/members/delete-rejected", { confirm: "DELETE_REJECTED", reason });
      window.alert(`반려 상태 계정 전체 삭제 완료: ${Number(body.data?.deletedCount ?? rejectedMemberCount).toLocaleString()}명`);
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel panel-pad">
      <div className="section-head">
        <div>
          <h2 className="panel-title"><AlertTriangle size={20} /> 반려 상태 계정 정리</h2>
          <p className="muted">반려 상태인 일반 회원을 검색 조건과 관계없이 한 번에 삭제 처리합니다. 총관리자만 사용할 수 있습니다.</p>
        </div>
        <button className="btn btn-danger" type="button" onClick={() => void deleteRejectedMembers()} disabled={loading || rejectedMemberCount < 1}>
          {loading ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />} 반려 상태 전체 삭제 ({rejectedMemberCount.toLocaleString()}명)
        </button>
      </div>
    </section>
  );
}
