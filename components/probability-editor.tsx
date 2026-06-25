"use client";

import { LoaderCircle, Save, Sigma } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Draw } from "@/lib/types";
import { formatPercent, probabilityToPercent } from "@/lib/utils";

export function ProbabilityEditor({ draw }: { draw: Draw }) {
  const router = useRouter();
  const rewards = draw.rewards ?? [];
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(rewards.map((reward) => [reward.id, String(probabilityToPercent(reward.probability_units))])),
  );
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const total = useMemo(() => Object.values(values).reduce((sum, value) => sum + (Number(value) || 0), 0), [values]);
  const valid = Math.abs(total - 100) < 0.00005;

  async function save() {
    if (!valid) return window.alert("확률 합계가 정확히 100%여야 합니다.");
    if (reason.trim().length < 2) return window.alert("변경 사유를 입력해 주세요.");
    setLoading(true);
    const response = await fetch(`/api/admin/draws/${draw.id}/probabilities`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason,
        probabilities: rewards.map((reward) => ({ rewardId: reward.id, percent: Number(values[reward.id]) })),
      }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) return window.alert(body.error?.message ?? "확률을 저장하지 못했습니다.");
    setReason("");
    router.refresh();
  }

  return (
    <div className="probability-editor">
      {rewards.map((reward) => (
        <div className="probability-row" key={reward.id}>
          <div><strong>{reward.name}</strong><div className="text-muted text-small">현재 {formatPercent(probabilityToPercent(reward.probability_units), 4)}</div></div>
          <div className="field"><label className="sr-only" htmlFor={`prob-${reward.id}`}>확률</label><input id={`prob-${reward.id}`} className="input" type="number" step="0.0001" min="0" max="100" value={values[reward.id]} onChange={(event) => setValues((prev) => ({ ...prev, [reward.id]: event.target.value }))} /></div>
          <span className="prob-stock text-muted text-small">재고 {reward.stock ?? "무제한"}</span>
        </div>
      ))}
      <div className="probability-total"><span><Sigma size={15} style={{ verticalAlign: -3 }} /> 확률 총합</span><strong className={valid ? "valid" : "invalid"}>{total.toFixed(4)}%</strong></div>
      <div className="field"><label htmlFor={`reason-${draw.id}`}>변경 사유</label><input id={`reason-${draw.id}`} className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="예: 이벤트 2주차 확률 조정" maxLength={200} /></div>
      <button className="btn btn-primary" onClick={save} disabled={loading || !valid}>{loading ? <LoaderCircle size={16} /> : <Save size={16} />} 확률 저장</button>
    </div>
  );
}
