"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const labels: Record<string, string> = {
  USER: "일반 회원",
  VIEWER: "조회 관리자",
  MANAGER: "일반 관리자",
  SUPER_ADMIN: "최고 관리자",
};

export function RoleManager({ memberId, role, canManage }: { memberId: string; role: string; canManage: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(role);
  const [loading, setLoading] = useState(false);

  if (!canManage) return <span className="badge badge-muted">{labels[role] ?? role}</span>;

  async function save() {
    if (selected === role) return;
    if (!window.confirm(`${labels[role] ?? role} → ${labels[selected] ?? selected}(으)로 권한을 변경할까요?`)) {
      setSelected(role);
      return;
    }
    setLoading(true);
    const response = await fetch(`/api/admin/members/${memberId}/role`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: selected }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      setSelected(role);
      return window.alert(body.error?.message ?? "권한을 변경하지 못했습니다.");
    }
    router.refresh();
  }

  return (
    <div className="inline-role-editor">
      <select className="select select-compact" value={selected} onChange={(event) => setSelected(event.target.value)} disabled={loading} aria-label="회원 역할">
        <option value="USER">일반 회원</option>
        <option value="VIEWER">조회 관리자</option>
        <option value="MANAGER">일반 관리자</option>
        <option value="SUPER_ADMIN">최고 관리자</option>
      </select>
      <button className="btn btn-secondary btn-sm" type="button" onClick={save} disabled={loading || selected === role}>
        {loading ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />} 저장
      </button>
    </div>
  );
}
