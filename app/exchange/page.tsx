import type { Metadata } from "next";
import { ArrowRight, Box, IdCard } from "lucide-react";
import { ExchangeButton } from "@/components/exchange-button";
import { requireApprovedUser } from "@/lib/auth";
import { getExchangeRules, getUserInventory } from "@/lib/data";

export const metadata: Metadata = { title: "상품 교환" };
export const dynamic = "force-dynamic";

export default async function ExchangePage() {
  const profile = await requireApprovedUser();
  const [inventory, rules] = await Promise.all([getUserInventory(profile.id), getExchangeRules()]);
  const quantities = new Map<string, number>();
  for (const item of inventory) {
    quantities.set(item.reward_id, (quantities.get(item.reward_id) ?? 0) + item.quantity);
    if (item.product_catalog_id) quantities.set(`product:${item.product_catalog_id}`, (quantities.get(`product:${item.product_catalog_id}`) ?? 0) + item.quantity);
  }
  return <main className="page"><div className="container"><div className="page-heading-row"><div className="page-heading mb-0"><h1>상품 교환</h1><p>회원 고유 ID에 연결된 보유 수량을 사용해 다른 상품으로 교환합니다.</p></div><div className="member-code"><IdCard size={18} /> {profile.member_code}</div></div><div className="grid grid-3 mt-3">{inventory.map((item) => <article className="panel inventory-card" key={item.reward_id}><div className="inventory-name"><div className="inventory-orb" style={{ "--item-color": item.reward_color } as React.CSSProperties}><Box size={20} /></div><strong>{item.reward_name}</strong></div><span className="inventory-qty">× {item.quantity}</span></article>)}</div><div className="section-heading mt-3"><div><h2>교환 가능한 규칙</h2><p>버튼을 누르면 재료 수량을 잠그고 한 번의 DB 거래로 차감과 지급을 함께 처리합니다.</p></div></div><div className="grid">{rules.map((rule) => { const owned = (rule.source_product_catalog_id ? quantities.get(`product:${rule.source_product_catalog_id}`) : undefined) ?? quantities.get(rule.source_reward_id) ?? 0; const canExchange = owned >= rule.source_quantity; return <article className="panel exchange-rule" key={rule.id}><div className="exchange-side"><div className="exchange-icon">−</div><div><strong>{rule.source_reward_name} × {rule.source_quantity}</strong><span>현재 {owned}개 보유</span></div></div><ArrowRight className="text-gold" /><div className="exchange-side"><div className="exchange-icon">+</div><div><strong>{rule.target_reward_name} × {rule.target_quantity}</strong><span>{rule.name}</span></div></div><ExchangeButton ruleId={rule.id} canExchange={canExchange} /></article>; })}</div></div></main>;
}
