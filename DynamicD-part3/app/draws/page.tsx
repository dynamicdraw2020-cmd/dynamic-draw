import type { Metadata } from "next";
import { RewardCard } from "@/components/reward-card";
import { StatusBadge } from "@/components/status-badge";
import { getPublicDraws } from "@/lib/data";

export const metadata: Metadata = { title: "진행 중인 뽑기" };
export const dynamic = "force-dynamic";

export default async function DrawsPage() {
  const draws = await getPublicDraws();
  return <main className="page"><div className="container"><div className="page-heading"><h1>진행 중인 뽑기</h1><p>공개 상태인 뽑기와 상품별 설정 확률을 확인합니다.</p></div><div className="grid">{draws.map((draw) => <section className="panel panel-pad" key={draw.id}><div className="flex justify-between items-center wrap gap-2"><div><div className="flex items-center gap-1"><h2 className="panel-title mb-0">{draw.name}</h2><StatusBadge status={draw.status} /></div><p className="panel-description mt-1">{draw.description}</p></div><span className="text-muted text-small">연출 {draw.animation_ms / 1000}초</span></div><div className="grid grid-4 mt-3">{(draw.rewards ?? []).filter((reward) => reward.is_active).map((reward) => <RewardCard key={reward.id} reward={reward} />)}</div></section>)}</div></div></main>;
}
