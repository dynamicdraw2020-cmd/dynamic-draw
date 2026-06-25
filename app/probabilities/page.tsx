import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { RewardCard } from "@/components/reward-card";
import { getPublicDraws } from "@/lib/data";
import { probabilityToPercent } from "@/lib/utils";

export const metadata: Metadata = { title: "확률표" };
export const dynamic = "force-dynamic";

export default async function ProbabilitiesPage() {
  const draws = await getPublicDraws();
  return <main className="page"><div className="container"><div className="page-heading"><h1>공개 확률표</h1><p>활성 상품의 확률 합계는 항상 정확히 100%여야 하며, 서버가 저장 전에 다시 검증합니다.</p></div><div className="note-box mb-0"><ShieldCheck size={16} style={{ verticalAlign: -3 }} /> 관리자가 확률을 바꾸면 변경 전·후 값과 사유가 별도 감사 기록으로 저장됩니다.</div><div className="grid mt-3">{draws.map((draw) => { const rewards = (draw.rewards ?? []).filter((r) => r.is_active); const total = rewards.reduce((sum, reward) => sum + probabilityToPercent(reward.probability_units), 0); return <section key={draw.id}><div className="section-heading"><div><h2>{draw.name}</h2><p>{draw.description}</p></div><span className="member-code">합계 {total.toFixed(4)}%</span></div><div className="grid grid-4">{rewards.map((reward) => <RewardCard key={reward.id} reward={reward} />)}</div></section>; })}</div></div></main>;
}
