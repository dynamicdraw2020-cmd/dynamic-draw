import type { Metadata } from "next";
import { ClawMachinePreview } from "@/components/claw-raffle-stage";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getPublicRaffles } from "@/lib/data";
import { formatDateTime, maskMemberCode, maskName } from "@/lib/utils";

export const metadata: Metadata = { title: "전체 추첨" };
export const dynamic = "force-dynamic";

export default async function RafflesPage() {
  const raffles = await getPublicRaffles(50);
  return <main className="page public-subpage"><RealtimeRefresh /><div className="container"><div className="page-heading public-page-heading"><span className="section-kicker">Member Raffle</span><h1>전체 추첨 이벤트</h1><p>전체 추첨 이벤트를 확인할 수 있습니다.</p></div><section className="public-card public-card-feature"><div className="claw-public-layout"><div><h2>전체 추첨 이벤트</h2><p>실시간으로 결과를 확인해 보세요!</p></div><ClawMachinePreview /></div></section><div className="raffle-list">{raffles.length ? raffles.map((raffle) => <article className="public-card raffle-public-item" key={raffle.id}><div><strong>{raffle.title}</strong><p>{raffle.description ?? "공개 전체 추첨 이벤트입니다."}</p><span>{raffle.starts_at ? formatDateTime(raffle.starts_at) : "상시"}{raffle.ends_at ? ` ~ ${formatDateTime(raffle.ends_at)}` : ""}</span></div><div className="raffle-prize"><small>추첨 상품</small><b>{raffle.prize_name}</b>{raffle.winner_member_code ? <em>당첨 {maskName(raffle.winner_display_name)} · {maskMemberCode(raffle.winner_member_code)}</em> : <em>{raffle.status === "ACTIVE" ? "진행 예정" : "결과 대기"}</em>}</div></article>) : <div className="public-card empty">아직 공개된 전체 추첨 이벤트가 없습니다.</div>}</div></div></main>;
}
