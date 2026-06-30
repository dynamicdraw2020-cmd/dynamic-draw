"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS } from "@/lib/admin-capabilities";

const roleOptions = [
  { value: "USER", label: ROLE_LABELS.USER },
  { value: "VIEWER", label: ROLE_LABELS.VIEWER },
  { value: "CS_MANAGER", label: ROLE_LABELS.CS_MANAGER },
  { value: "MANAGER", label: ROLE_LABELS.MANAGER },
  { value: "SUPER_ADMIN", label: ROLE_LABELS.SUPER_ADMIN },
] as const;

export function RoleManager({ memberId, role, canManage }: { memberId: string; role: string; canManage: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(role);
  const [loading, setLoading] = useState(false);

  if (!canManage) return <span>{ROLE_LABELS[role] ?? role}</span>;

  async function save() {
    if (selected === role) return;
    if (!window.confirm(`${ROLE_LABELS[role] ?? role} → ${ROLE_LABELS[selected] ?? selected}(으)로 권한을 변경할까요?`)) {
      setSelected(role);
      return;
    }

    setLoading(true);
    const response = await fetch(`/api/admin/members/${memberId}/role`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: selected }),
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setSelected(role);
      return window.alert(body.error?.message ?? "권한을 변경하지 못했습니다.");
    }

    router.refresh();
  }

  return (
    <div className="role-manager">
      <select className="select" value={selected} onChange={(event) => setSelected(event.target.value)} disabled={loading} aria-label="회원 역할">
        {roleOptions.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => void save()} disabled={loading || selected === role}>
        {loading ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />} 저장
      </button>
    </div>
  );
}
