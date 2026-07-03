import { Gift, LockKeyhole, Sparkles, Trophy } from "lucide-react";
import type { RaffleEvent } from "@/lib/types";
import { formatDateTime, maskMemberCode, maskName } from "@/lib/utils";

export function PublicGachaRaffle({ raffles }: { raffles: RaffleEvent[] }) {
  const featured = raffles[0] ?? null;
  const completed = raffles.find((item) => item.status === "COMPLETED" && item.winner_member_code);
  return <section className="public-card public-card-feature gacha-public-card">
    <div className="gacha-public-layout">
      <div className="gacha-copy">
        <span className="section-kicker"><Sparkles size={14} /> 추첨이벤트</span>
        <h2>가챠 추첨 이벤트</h2>
        <p>관리자가 설정한 공개 추첨 이벤트입니다. 이벤트별 조건과 등급 제한을 확인한 뒤 참여해 주세요.</p>
        {featured ? <div className="raffle-summary-card"><strong>{featured.title}</strong><span>{featured.prize_name}</span><small>{featured.status === "COMPLETED" ? "추첨 완료" : `상태 ${featured.status}`}{featured.starts_at ? ` · ${formatDateTime(featured.starts_at)}` : ""}</small></div> : <div className="raffle-summary-card muted">아직 공개된 추첨이벤트가 없습니다.</div>}
        {completed && <div className="raffle-winner-line">최근 당첨: <strong>{maskName(completed.winner_display_name)}</strong> · {maskMemberCode(completed.winner_member_code)}</div>}
        <div className="note-box mt-2"><LockKeyhole size={15} /> 일부 추첨이벤트는 회원 등급 조건이 있을 수 있습니다.</div>
      </div>
      <div className="gacha-machine" aria-hidden="true">
        <div className="gacha-glass"><div className="gacha-capsule cap-a" /><div className="gacha-capsule cap-b" /><div className="gacha-capsule cap-c" /><div className="gacha-capsule cap-d" /></div>
        <div className="gacha-dial"><Gift size={34} /></div>
        <div className="gacha-tray"><Trophy size={20} /> 𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃</div>
      </div>
    </div>
  </section>;
}
