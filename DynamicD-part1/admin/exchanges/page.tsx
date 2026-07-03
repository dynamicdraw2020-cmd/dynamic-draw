import type { Metadata } from "next";
import { AdminExchangeConsole } from "@/components/admin-exchange-console";
import { ExchangeRuleManager } from "@/components/exchange-rule-manager";
import { requireAdmin } from "@/lib/auth";
import { getAdminDraws, getAdminExchangeRules, getAdminMembers } from "@/lib/data";
import type { ExchangeRule } from "@/lib/types";

export const metadata: Metadata = { title: "교환 시스템 관리" };

export default async function AdminExchangesPage() {
  await requireAdmin("MANAGER");
  const [rawRules, draws, members] = await Promise.all([getAdminExchangeRules(), getAdminDraws(), getAdminMembers()]);
  const rewards = draws.flatMap((draw) => draw.rewards ?? []);
  const rules = rawRules.map((rule) => {
    const relational = rule as typeof rule & { source?: { name?: string } | Array<{ name?: string }>; target?: { name?: string } | Array<{ name?: string }> };
    const source = Array.isArray(relational.source) ? relational.source[0] : relational.source;
    const target = Array.isArray(relational.target) ? relational.target[0] : relational.target;
    return {
      id: rule.id,
      name: rule.name,
      source_reward_id: rule.source_reward_id,
      source_reward_name: source?.name ?? "교환 재료",
      source_quantity: rule.source_quantity,
      target_reward_id: rule.target_reward_id,
      target_reward_name: target?.name ?? "교환 상품",
      target_quantity: rule.target_quantity,
      is_active: rule.is_active,
    } satisfies ExchangeRule;
  });

  return <><div className="admin-toolbar"><div><h1>교환 시스템</h1><p className="text-muted">고유 ID 현장 교환과 교환 규칙을 한곳에서 관리합니다.</p></div></div><div className="grid"><AdminExchangeConsole members={members} rules={rules} /><ExchangeRuleManager rules={rawRules} rewards={rewards} /></div></>;
}
