import { Gift, Ticket, Trophy, XCircle } from "lucide-react";
import type { Reward } from "@/lib/types";
import { formatPercent, probabilityToPercent } from "@/lib/utils";

function RewardIcon({ name }: { name: string }) {
  if (name.includes("꽝")) return <XCircle size={27} />;
  if (name.includes("입장권") || name.includes("티켓")) return <Ticket size={27} />;
  if (name.toLowerCase().includes("dynamic")) return <Trophy size={27} />;
  return <Gift size={27} />;
}

export function RewardCard({ reward }: { reward: Reward }) {
  const percent = probabilityToPercent(reward.probability_units);
  return (
    <article className="panel reward-card" style={{ "--reward-color": reward.color } as React.CSSProperties}>
      <div className="reward-orb"><RewardIcon name={reward.name} /></div>
      <h3>{reward.name}</h3>
      <p>{reward.description || "이벤트 상품"}</p>
      <div className="reward-rate"><span>설정 확률</span><strong>{formatPercent(percent, 4)}</strong></div>
      <div className="progress"><span style={{ width: `${Math.max(percent, 0.3)}%` }} /></div>
    </article>
  );
}
