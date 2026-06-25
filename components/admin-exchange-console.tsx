"use client";

import { ArrowRightLeft, LoaderCircle, Search, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import type { ExchangeRule, Profile } from "@/lib/types";

export function AdminExchangeConsole({ members, rules }: { members: Profile[]; rules: ExchangeRule[] }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const approved = members.filter((member) => member.status === "APPROVED" && member.role === "USER" && member.member_code);
  const activeRules = rules.filter((rule) => rule.is_active);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const memberCode = String(values.get("memberCode") ?? "").trim().toUpperCase();
    const ruleId = String(values.get("ruleId") ?? "");
    if (!window.confirm(`${memberCode} 회원의 상품을 교환 처리할까요? 수량은 즉시 차감·지급됩니다.`)) return;

    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/admin/exchanges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberCode, ruleId, idempotencyKey: crypto.randomUUID() }),
    });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body?.error?.message ?? "교환 처리에 실패했습니다." });
      return;
    }
    const result = body.data;
    setMessage({
      type: "success",
      text: `${result.memberName} (${result.memberCode}) · ${result.sourceRewardName} ${result.sourceQuantity}개 차감 → ${result.targetRewardName} ${result.targetQuantity}개 지급 완료`,
    });
  }

  return (
    <form className="panel panel-pad form-grid" onSubmit={submit}>
      <div>
        <h2 className="panel-title"><ArrowRightLeft size={19} style={{ verticalAlign: -4 }} /> 관리자 현장 교환</h2>
        <p className="panel-description">회원의 고유 ID를 조회해 관리자가 현장에서 대신 교환합니다. 회원의 자기 교환 기능도 그대로 사용할 수 있습니다.</p>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="admin-exchange-member">회원 고유 ID</label>
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 13, top: 14, color: "#71839a" }} />
            <input className="input" id="admin-exchange-member" name="memberCode" list="member-code-list" required placeholder="DD-2026-001001" autoComplete="off" style={{ paddingLeft: 39 }} />
          </div>
          <datalist id="member-code-list">
            {approved.map((member) => <option key={member.id} value={member.member_code ?? ""}>{member.display_name} · {member.email}</option>)}
          </datalist>
          <small><UserRound size={12} style={{ verticalAlign: -2 }} /> 회원 관리 화면에서 발급된 ID를 입력합니다.</small>
        </div>
        <div className="field">
          <label htmlFor="admin-exchange-rule">교환 규칙</label>
          <select className="select" id="admin-exchange-rule" name="ruleId" required defaultValue={activeRules[0]?.id ?? ""}>
            {!activeRules.length && <option value="">활성 교환 규칙이 없습니다</option>}
            {activeRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.source_reward_name} {rule.source_quantity}개 → {rule.target_reward_name} {rule.target_quantity}개</option>)}
          </select>
        </div>
      </div>
      {message && <div className={`form-message form-${message.type}`}>{message.text}</div>}
      <button className="btn btn-primary" type="submit" disabled={loading || !approved.length || !activeRules.length}>
        {loading ? <LoaderCircle size={16} className="spin" /> : <ArrowRightLeft size={16} />} 현장 교환 실행
      </button>
    </form>
  );
}
