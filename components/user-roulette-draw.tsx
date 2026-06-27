"use client";

import type { CSSProperties } from "react";
import { ArrowLeft, Coins, Gift, LoaderCircle, Repeat2, Sparkles, Ticket, Trophy, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Draw, Reward, UserCurrencyBalance, UserDrawTicket, UserTicketExchangeRate } from "@/lib/types";
import { formatPercent, probabilityToPercent } from "@/lib/utils";

type Phase = "idle" | "spinning" | "revealing" | "result" | "error";
type ResultPayload = { rewardName: string; rewardColor: string; participantName?: string; memberCode?: string };
type RouletteStyle = CSSProperties & { "--spin-rotation"?: string; "--spin-duration"?: string; "--segment-count"?: number; "--result-color"?: string; "--legend-color"?: string };

function activeRewards(draw?: Draw) {
  return (draw?.rewards ?? []).filter((reward) => reward.is_active && reward.probability_units > 0);
}

function equalWheelGradient(rewards: Array<Pick<Reward, "color">>) {
  if (!rewards.length) return "conic-gradient(#f6c453 0deg 360deg)";
  const span = 360 / rewards.length;
  return `conic-gradient(${rewards.map((reward, index) => `${reward.color} ${index * span}deg ${(index + 1) * span}deg`).join(", ")})`;
}

export function UserRouletteDraw({ tickets, currencies, exchangeRates }: { tickets: UserDrawTicket[]; currencies: UserCurrencyBalance[]; exchangeRates: UserTicketExchangeRate[] }) {
  const router = useRouter();
  const firstDrawId = tickets.find((ticket) => ticket.quantity > 0 && ticket.draw.status === "ACTIVE")?.draw.id ?? tickets[0]?.draw.id ?? exchangeRates[0]?.draw.id ?? "";
  const [selectedDrawId, setSelectedDrawId] = useState(firstDrawId);
  const selectedTicket = tickets.find((ticket) => ticket.draw.id === selectedDrawId);
  const selectedDraw = selectedTicket?.draw ?? exchangeRates.find((rate) => rate.draw.id === selectedDrawId)?.draw ?? tickets[0]?.draw;
  const rewards = activeRewards(selectedDraw);
  const ratesForDraw = exchangeRates.filter((rate) => rate.draw.id === selectedDrawId);
  const [selectedRateId, setSelectedRateId] = useState(ratesForDraw[0]?.id ?? exchangeRates[0]?.id ?? "");
  const selectedRate = ratesForDraw.find((rate) => rate.id === selectedRateId) ?? ratesForDraw[0] ?? exchangeRates[0];
  const [bundleCount, setBundleCount] = useState(1);
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [message, setMessage] = useState("추첨권을 선택하고 추첨을 시작해 주세요.");
  const [visualRotation, setVisualRotation] = useState(0);
  const [localTicketDelta, setLocalTicketDelta] = useState<Record<string, number>>({});

  const currentQuantity = Math.max(0, (selectedTicket?.quantity ?? 0) + (localTicketDelta[selectedDrawId] ?? 0));
  const totalTickets = Math.max(0, tickets.reduce((sum, ticket) => sum + ticket.quantity, 0) + Object.values(localTicketDelta).reduce((sum, value) => sum + value, 0));
  const canSpin = Boolean(selectedDraw && selectedDraw.status === "ACTIVE" && currentQuantity > 0 && phase !== "spinning" && phase !== "revealing");
  const gradient = useMemo(() => equalWheelGradient(rewards), [rewards]);
  const selectedCurrencyBalance = currencies.find((item) => item.currency.id === selectedRate?.currency.id)?.balance ?? 0;
  const exchangeCost = (selectedRate?.currencyCost ?? 0) * bundleCount;
  const exchangeTickets = (selectedRate?.ticketQuantity ?? 0) * bundleCount;
  const canExchange = Boolean(selectedRate && bundleCount > 0 && selectedCurrencyBalance >= exchangeCost && !exchangeLoading);

  function chooseDraw(drawId: string) {
    setSelectedDrawId(drawId);
    setSelectedRateId(exchangeRates.find((rate) => rate.draw.id === drawId)?.id ?? "");
  }

  function startWheel(animationMs: number) {
    const target = 2520 + Math.round(Math.random() * 360);
    setVisualRotation(0);
    window.setTimeout(() => setVisualRotation(target), 40);
    return Math.max(3000, animationMs);
  }

  async function exchangeCurrency() {
    if (!selectedRate) return window.alert("교환 규칙을 선택해 주세요.");
    if (!canExchange) return window.alert("보유 화폐가 부족합니다.");
    setExchangeLoading(true);
    try {
      const response = await fetch("/api/ticket-exchanges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rateId: selectedRate.id, bundleCount, idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "추첨권으로 교환하지 못했습니다.");
      window.alert(`교환 완료: ${body.data?.ticketsAdded ?? exchangeTickets}장 지급`);
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setExchangeLoading(false);
    }
  }

  async function startSpin() {
    if (!selectedDraw) return window.alert("추첨 이벤트를 선택해 주세요.");
    if (!canSpin) return window.alert("사용 가능한 추첨권이 없습니다.");
    setOverlayOpen(true);
    setPhase("spinning");
    setResult(null);
    setMessage("서버에서 결과를 먼저 결정하고 룰렛을 돌리는 중…");
    setLocalTicketDelta((prev) => ({ ...prev, [selectedDraw.id]: (prev[selectedDraw.id] ?? 0) - 1 }));
    const animationMs = startWheel(Number(selectedDraw.animation_ms ?? 4000));
    try {
      const response = await fetch(`/api/draws/${selectedDraw.id}/self-spin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "추첨을 실행하지 못했습니다.");
      const resultId = String(body.data?.resultId ?? "");
      window.setTimeout(async () => {
        setPhase("revealing");
        setMessage("결과 봉인을 여는 중…");
        const revealResponse = await fetch(`/api/results/${resultId}/reveal`, { method: "POST" });
        const revealBody = await revealResponse.json();
        if (!revealResponse.ok) throw new Error(revealBody.error?.message ?? "결과를 공개하지 못했습니다.");
        setResult({ rewardName: String(revealBody.data?.rewardName ?? "당첨 상품"), rewardColor: String(revealBody.data?.rewardColor ?? "#f6c453"), participantName: revealBody.data?.participantName ? String(revealBody.data.participantName) : undefined, memberCode: revealBody.data?.memberCode ? String(revealBody.data.memberCode) : undefined });
        setPhase("result");
        setMessage("결과가 공개되었습니다!");
        router.refresh();
      }, animationMs + 250);
    } catch (error) {
      setLocalTicketDelta((prev) => ({ ...prev, [selectedDraw.id]: (prev[selectedDraw.id] ?? 0) + 1 }));
      setPhase("error");
      setMessage((error as Error).message);
    }
  }

  function closeOverlay() {
    if (phase === "spinning" || phase === "revealing") return;
    setOverlayOpen(false);
    setVisualRotation(0);
    if (phase === "result") { setPhase("idle"); setResult(null); }
  }

  const allDraws = [...tickets.map((ticket) => ticket.draw), ...exchangeRates.map((rate) => rate.draw)].filter((draw, index, list) => list.findIndex((item) => item.id === draw.id) === index);

  return <div className="grid">
    <section className="panel panel-pad draw-play-hero"><div><span className="eyebrow"><Ticket size={14} /> DIRECT EVENT DRAW</span><h1>내 추첨권으로 직접 추첨하기</h1><p>룰렛 칸은 모두 같은 크기로 보여 확률을 유추할 수 없습니다. 실제 결과는 서버 확률로 먼저 결정됩니다.</p></div><div className="ticket-summary"><Ticket size={22} /><strong>{totalTickets.toLocaleString()}장</strong><span>전체 보유 추첨권</span></div></section>

    <div className="grid grid-2">
      <section className="panel panel-pad form-grid"><h2 className="panel-title">추첨 이벤트 선택</h2><p className="panel-description">진행 중이고 추첨권이 있는 이벤트만 실행할 수 있습니다.</p><div className="field"><label htmlFor="self-draw-select">사용할 이벤트</label><select id="self-draw-select" className="select" value={selectedDrawId} onChange={(event) => chooseDraw(event.target.value)}>{allDraws.map((draw) => { const quantity = Math.max(0, (tickets.find((ticket) => ticket.draw.id === draw.id)?.quantity ?? 0) + (localTicketDelta[draw.id] ?? 0)); return <option key={draw.id} value={draw.id}>{draw.name} · {quantity}장 · {draw.status}</option>; })}</select></div>{selectedDraw && <div className="note-box"><strong>{selectedDraw.name}</strong><br />사용 가능 추첨권: <strong>{currentQuantity.toLocaleString()}장</strong><br />연출 룰렛은 모든 칸을 같은 크기로 표시합니다.</div>}<button className="btn btn-primary btn-lg btn-block" disabled={!canSpin} onClick={startSpin}>{phase === "spinning" || phase === "revealing" ? <LoaderCircle size={20} className="spin" /> : <Sparkles size={20} />} 추첨권 1장 사용해서 추첨 시작</button></section>
      <section className="panel panel-pad form-grid"><h2 className="panel-title"><Coins size={19} style={{ verticalAlign: -3 }} /> 이벤트 화폐로 추첨권 교환</h2><p className="panel-description">현실 결제가 아닌 운영용 포인트입니다.</p>{ratesForDraw.length ? <><div className="field"><label htmlFor="rate-select">교환 규칙</label><select id="rate-select" className="select" value={selectedRate?.id ?? ""} onChange={(event) => setSelectedRateId(event.target.value)}>{ratesForDraw.map((rate) => <option key={rate.id} value={rate.id}>{rate.currency.name} {rate.currencyCost.toLocaleString()}{rate.currency.symbol ? ` ${rate.currency.symbol}` : ""} → {rate.ticketQuantity}장</option>)}</select></div><div className="field"><label htmlFor="bundle-count">교환 묶음 수</label><input id="bundle-count" className="input" type="number" min="1" max="100" value={bundleCount} onChange={(event) => setBundleCount(Math.max(1, Number(event.target.value || 1)))} /></div><div className="note-box">보유: <strong>{selectedCurrencyBalance.toLocaleString()}</strong> {selectedRate?.currency.symbol}<br />사용: <strong>{exchangeCost.toLocaleString()}</strong> {selectedRate?.currency.symbol}<br />받는 추첨권: <strong>{exchangeTickets.toLocaleString()}장</strong></div><button className="btn btn-secondary btn-lg btn-block" onClick={exchangeCurrency} disabled={!canExchange}>{exchangeLoading ? <LoaderCircle size={19} className="spin" /> : <Repeat2 size={19} />} 화폐를 추첨권으로 교환</button></> : <div className="empty">이 이벤트에 사용할 수 있는 화폐 교환 규칙이 없습니다.</div>}<div className="currency-list">{currencies.map((item) => <span key={item.currency.id} className="currency-chip"><Coins size={13} /> {item.currency.name}: {item.balance.toLocaleString()}{item.currency.symbol}</span>)}</div></section>
    </div>

    <section className="panel panel-pad"><h2 className="panel-title">상품 확률</h2><p className="panel-description">실제 확률은 아래 표 기준입니다. 애니메이션은 모든 칸을 동일 크기로 보여줍니다.</p><div className="roulette-preview mt-3"><div className="roulette-wheel mini optimized" style={{ background: gradient, "--segment-count": rewards.length } as RouletteStyle}>{rewards.slice(0, 6).map((reward, index) => <span key={reward.id} style={{ transform: `rotate(${(360 / Math.max(rewards.length, 1)) * index}deg) translateY(-88px) rotate(-${(360 / Math.max(rewards.length, 1)) * index}deg)` }}>{reward.image_url ? <img src={reward.image_url} alt="" /> : null}<b>{reward.name}</b></span>)}</div></div><div className="legend-list">{rewards.map((reward) => <div className="legend-item" key={reward.id}><span className="legend-dot" style={{ "--legend-color": reward.color } as RouletteStyle} /><span>{reward.name}</span><strong>{formatPercent(probabilityToPercent(reward.probability_units), 4)}</strong></div>)}</div></section>

    {overlayOpen && selectedDraw && <div className="roulette-overlay" role="dialog" aria-modal="true"><button className="roulette-close" onClick={closeOverlay} disabled={phase === "spinning" || phase === "revealing"} aria-label="룰렛 닫기">{phase === "spinning" || phase === "revealing" ? <LoaderCircle size={19} className="spin" /> : <X size={20} />}</button><div className="roulette-fullscreen-card"><button className="btn btn-ghost btn-sm roulette-back" onClick={closeOverlay} disabled={phase === "spinning" || phase === "revealing"}><ArrowLeft size={15} /> 돌아가기</button><div className="roulette-title"><span className="eyebrow"><span className="live-dot" /> OPTIMIZED ROULETTE</span><h2>{selectedDraw.name}</h2><p>{message}</p></div><div className="roulette-machine"><div className="roulette-pointer" /><div className={`roulette-wheel optimized ${phase === "spinning" || phase === "revealing" || phase === "result" ? "is-spinning" : ""}`} style={{ background: gradient, "--spin-rotation": `${visualRotation}deg`, "--spin-duration": `${Math.max(3000, selectedDraw.animation_ms)}ms`, "--segment-count": rewards.length } as RouletteStyle}>{rewards.slice(0, 8).map((reward, index) => { const angle = (360 / Math.max(rewards.length, 1)) * index; return <span key={reward.id} style={{ transform: `rotate(${angle}deg) translateY(-42%) rotate(-${angle}deg)` }}>{reward.image_url ? <img src={reward.image_url} alt="" /> : null}<b>{reward.name}</b></span>; })}</div><div className="roulette-center"><Trophy size={34} /><span>Dynamic</span></div></div><div className="roulette-result-panel" style={{ "--result-color": result?.rewardColor ?? "#f6c453" } as RouletteStyle}>{phase === "result" && result ? <><Gift size={26} /><strong>{result.rewardName}</strong><span>{result.participantName ?? "나"} · {result.memberCode ?? "내 결과"}</span><button className="btn btn-primary" onClick={closeOverlay}>확인</button></> : phase === "error" ? <><strong>실행 실패</strong><span>{message}</span><button className="btn btn-secondary" onClick={closeOverlay}>닫기</button></> : <><LoaderCircle size={26} className="spin" /><strong>{phase === "revealing" ? "결과 공개 중" : "룰렛 회전 중"}</strong><span>모바일 화면에서도 부드럽게 보이도록 최적화했습니다.</span></>}</div></div></div>}
  </div>;
}
