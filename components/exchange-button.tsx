"use client";

import { ArrowLeftRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ExchangeButton({ ruleId, canExchange }: { ruleId: string; canExchange: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function exchange() {
    if (!window.confirm("선택한 상품으로 교환할까요? 완료 후 자동으로 수량이 차감·지급됩니다.")) return;
    setLoading(true);
    const response = await fetch("/api/exchanges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruleId, idempotencyKey: crypto.randomUUID() }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) return window.alert(body.error?.message ?? "교환하지 못했습니다.");
    window.alert(`${body.data?.targetRewardName ?? "상품"} 교환이 완료되었습니다.`);
    router.refresh();
  }

  return <button className="btn btn-primary exchange-action" onClick={exchange} disabled={!canExchange || loading}>{loading ? <LoaderCircle size={16} /> : <ArrowLeftRight size={16} />} {canExchange ? "교환하기" : "수량 부족"}</button>;
}
