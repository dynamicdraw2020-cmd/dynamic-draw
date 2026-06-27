"use client";

import { ArrowRight, LoaderCircle, Plus, Power, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Reward } from "@/lib/types";

interface RuleRow {
  id: string;
  name: string;
  source_reward_id: string;
  source_quantity: number;
  target_reward_id: string;
  target_quantity: number;
  is_active: boolean;
  source?: { name?: string } | Array<{ name?: string }>;
  target?: { name?: string } | Array<{ name?: string }>;
  source_reward_name?: string;
  target_reward_name?: string;
}

function relationName(value: RuleRow["source"], fallback?: string) {
  if (Array.isArray(value)) return value[0]?.name ?? fallback ?? "상품";
  return value?.name ?? fallback ?? "상품";
}

export function ExchangeRuleManager({ rules, rewards }: { rules: RuleRow[]; rewards: Reward[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);

  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "처리하지 못했습니다.");
    router.refresh();
  }

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setLoading("new");
    try {
      await request("/api/admin/exchange-rules", "POST", {
        name: form.get("name"),
        sourceRewardId: form.get("sourceRewardId"),
        sourceQuantity: Number(form.get("sourceQuantity")),
        targetRewardId: form.get("targetRewardId"),
        targetQuantity: Number(form.get("targetQuantity")),
      });
      setFormVersion((version) => version + 1);
    } catch (error) { window.alert((error as Error).message); } finally { setLoading(null); }
  }

  async function toggle(rule: RuleRow) {
    setLoading(rule.id);
    try { await request(`/api/admin/exchange-rules/${rule.id}`, "PATCH", { isActive: !rule.is_active }); }
    catch (error) { window.alert((error as Error).message); } finally { setLoading(null); }
  }

  async function remove(rule: RuleRow) {
    if (!window.confirm(`“${rule.name}” 규칙을 비활성화할까요? 기존 교환 기록은 남습니다.`)) return;
    setLoading(rule.id);
    try { await request(`/api/admin/exchange-rules/${rule.id}`, "DELETE"); }
    catch (error) { window.alert((error as Error).message); } finally { setLoading(null); }
  }

  return (
    <div className="grid">
      <form key={`exchange-rule-form-${formVersion}`} className="panel panel-pad form-grid" onSubmit={createRule}>
        <div><h2 className="panel-title">새 교환 규칙</h2><p className="panel-description">찢어진 입장권뿐 아니라 관리자가 만든 어떤 보관 상품도 교환 재료로 사용할 수 있습니다.</p></div>
        <div className="field"><label>규칙 이름</label><input className="input" name="name" required maxLength={80} placeholder="예: 입장권 5개로 DwX 교환" /></div>
        <div className="form-row">
          <div className="field"><label>차감할 상품</label><select className="select" name="sourceRewardId" required>{rewards.filter((r) => r.is_inventory_item).map((reward) => <option key={reward.id} value={reward.id}>{reward.name}</option>)}</select></div>
          <div className="field"><label>차감 수량</label><input className="input" name="sourceQuantity" type="number" min="1" defaultValue="5" required /></div>
        </div>
        <div className="form-row">
          <div className="field"><label>지급할 상품</label><select className="select" name="targetRewardId" required>{rewards.filter((r) => r.is_inventory_item).map((reward) => <option key={reward.id} value={reward.id}>{reward.name}</option>)}</select></div>
          <div className="field"><label>지급 수량</label><input className="input" name="targetQuantity" type="number" min="1" defaultValue="1" required /></div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading === "new"}>{loading === "new" ? <LoaderCircle size={16} /> : <Plus size={16} />} 규칙 추가</button>
      </form>

      <section className="grid">
        {rules.map((rule) => (
          <article className="panel exchange-rule" key={rule.id}>
            <div className="exchange-side"><div className="exchange-icon">−</div><div><strong>{relationName(rule.source, rule.source_reward_name)} × {rule.source_quantity}</strong><span>자동 차감</span></div></div>
            <ArrowRight className="text-gold" />
            <div className="exchange-side"><div className="exchange-icon">+</div><div><strong>{relationName(rule.target, rule.target_reward_name)} × {rule.target_quantity}</strong><span>{rule.name}</span></div></div>
            <div className="exchange-action table-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => toggle(rule)} disabled={loading === rule.id}><Power size={14} /> {rule.is_active ? "사용 중" : "꺼짐"}</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(rule)} disabled={loading === rule.id}><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
