"use client";

import { ArrowLeft, Gift, LoaderCircle, Sparkles, Ticket, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Draw, Reward, UserDrawTicket } from "@/lib/types";
import { formatPercent, probabilityToPercent } from "@/lib/utils";

type RoulettePhase = "idle" | "spinning" | "revealing" | "result" | "error";
type ResultPayload = { rewardName: string; rewardColor: string; participantName?: string; memberCode?: string };

function activeRewards(draw: Draw | undefined) {
  return (draw?.rewards ?? []).filter((reward) => reward.is_active && reward.probability_units > 0);
}

function wheelGradient(rewards: Reward[]) {
  if (!rewards.length) return "conic-gradient(#f6c453 0deg 360deg)";
  let cursor = 0;
  const parts = rewards.map((reward) => {
    const span = Math.max(1, reward.probability_units / 1_000_000 * 360);
    const start = cursor;
    const end = cursor + span;
    cursor = end;
    return `${reward.color} ${start}deg ${end}deg`;
  });
  return `conic-gradient(${parts.join(", ")})`;
}

export function UserRouletteDraw({ tickets }: { tickets: UserDrawTicket[] }) {
  const router = useRouter();
  const playableTickets = tickets.filter((ticket) => ticket.quantity > 0 && ticket.draw.status === "ACTIVE");
  const [selectedDrawId, setSelectedDrawId] = useState(playableTickets[0]?.draw.id ?? tickets[0]?.draw.id ?? "");
  const selectedTicket = tickets.find((ticket) => ticket.draw.id === selectedDrawId) ?? tickets[0];
  const selectedDraw = selectedTicket?.draw;
  const rewards = activeRewards(selectedDraw);
  const [phase, setPhase] = useState<RoulettePhase>("idle");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [message, setMessage] = useState("추첨권을 선택하고 룰렛을 돌려보세요.");
  const [spinKey, setSpinKey] = useState(0);
  const [localTicketDelta, setLocalTicketDelta] = useState<Record<string, number>>({});

  const currentQuantity = Math.max(0, (selectedTicket?.quantity ?? 0) + (localTicketDelta[selectedDrawId] ?? 0));
  const canSpin = Boolean(selectedDraw && selectedDraw.status === "ACTIVE" && currentQuantity > 0 && phase !== "spinning" && phase !== "revealing");

  const rotation = useMemo(() => 2160 + ((spinKey * 137) % 360), [spinKey]);
  const gradient = useMemo(() => wheelGradient(rewards), [rewards]);

  async function startSpin() {
    if (!selectedDraw) return window.alert("뽑기를 선택해 주세요.");
    if (!canSpin) return window.alert("사용 가능한 추첨권이 없습니다.");
    setOverlayOpen(true);
    setPhase("spinning");
    setResult(null);
    setMessage("서버에서 결과를 먼저 결정하고 룰렛을 돌리는 중…");
    setSpinKey((value) => value + 1);
    setLocalTicketDelta((prev) => ({ ...prev, [selectedDraw.id]: (prev[selectedDraw.id] ?? 0) - 1 }));

    try {
      const response = await fetch(`/api/draws/${selectedDraw.id}/self-spin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "뽑기를 실행하지 못했습니다.");

      const animationMs = Math.max(3200, Number(body.data?.animationMs ?? selectedDraw.animation_ms ?? 4000));
      const resultId = String(body.data?.resultId ?? "");
      window.setTimeout(async () => {
        setPhase("revealing");
        setMessage("결과 봉인을 여는 중…");
        const revealResponse = await fetch(`/api/results/${resultId}/reveal`, { method: "POST" });
        const revealBody = await revealResponse.json();
        if (!revealResponse.ok) throw new Error(revealBody.error?.message ?? "결과를 공개하지 못했습니다.");
        setResult({
          rewardName: String(revealBody.data?.rewardName ?? "당첨 상품"),
          rewardColor: String(revealBody.data?.rewardColor ?? "#f6c453"),
          participantName: revealBody.data?.participantName ? String(revealBody.data.participantName) : undefined,
          memberCode: revealBody.data?.memberCode ? String(revealBody.data.memberCode) : undefined,
        });
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
    if (phase === "result") {
      setPhase("idle");
      setResult(null);
    }
  }

  return (
    <div className="grid">
      <section className="panel panel-pad draw-play-hero">
        <div>
          <span className="eyebrow"><Ticket size={14} /> SELF DRAW</span>
          <h1>내 추첨권으로 직접 룰렛 돌리기</h1>
          <p>관리자가 넣어준 추첨권을 사용합니다. 결과는 서버에서 먼저 결정되고, 화면은 룰렛 연출만 담당합니다.</p>
        </div>
        <div className="ticket-summary"><Ticket size={22} /><strong>{tickets.reduce((sum, ticket) => sum + ticket.quantity, 0).toLocaleString()}장</strong><span>전체 보유 추첨권</span></div>
      </section>

      {tickets.length ? (
        <div className="grid grid-2">
          <section className="panel panel-pad form-grid">
            <h2 className="panel-title">뽑기 선택</h2>
            <p className="panel-description">진행 중이고 추첨권이 있는 뽑기만 실행할 수 있습니다.</p>
            <div className="field">
              <label htmlFor="self-draw-select">사용할 뽑기</label>
              <select id="self-draw-select" className="select" value={selectedDrawId} onChange={(event) => setSelectedDrawId(event.target.value)}>
                {tickets.map((ticket) => <option key={ticket.draw.id} value={ticket.draw.id}>{ticket.draw.name} · {ticket.quantity}장 · {ticket.draw.status}</option>)}
              </select>
            </div>
            {selectedDraw && <div className="note-box"><strong>{selectedDraw.name}</strong><br />현재 사용 가능 추첨권: <strong>{currentQuantity.toLocaleString()}장</strong><br />연출 시간: {(selectedDraw.animation_ms / 1000).toFixed(0)}초</div>}
            <button className="btn btn-primary btn-lg btn-block" disabled={!canSpin} onClick={startSpin}>{phase === "spinning" || phase === "revealing" ? <LoaderCircle size={20} className="spin" /> : <Sparkles size={20} />} 추첨권 1장 사용해서 룰렛 돌리기</button>
          </section>

          <section className="panel panel-pad">
            <h2 className="panel-title">상품 확률</h2>
            <p className="panel-description">확률 합계는 관리자가 100%로 검증한 값입니다.</p>
            <div className="roulette-preview mt-3"><div className="roulette-wheel mini" style={{ background: gradient }}>{rewards.slice(0, 6).map((reward, index) => <span key={reward.id} style={{ transform: `rotate(${(360 / Math.max(rewards.length, 1)) * index}deg) translateY(-88px) rotate(-${(360 / Math.max(rewards.length, 1)) * index}deg)` }}>{reward.name}</span>)}</div></div>
            <div className="legend-list">{rewards.map((reward) => <div className="legend-item" key={reward.id}><span className="legend-dot" style={{ "--legend-color": reward.color } as React.CSSProperties} /><span>{reward.name}</span><strong>{formatPercent(probabilityToPercent(reward.probability_units), 4)}</strong></div>)}</div>
          </section>
        </div>
      ) : (
        <section className="panel panel-pad empty">아직 사용할 수 있는 추첨권이 없습니다. 관리자에게 추첨권 지급을 요청해 주세요.</section>
      )}

      <AnimatePresence>
        {overlayOpen && selectedDraw && (
          <motion.div className="roulette-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true">
            <button className="roulette-close" onClick={closeOverlay} disabled={phase === "spinning" || phase === "revealing"} aria-label="룰렛 닫기">{phase === "spinning" || phase === "revealing" ? <LoaderCircle size={19} className="spin" /> : <X size={20} />}</button>
            <div className="roulette-fullscreen-card">
              <button className="btn btn-ghost btn-sm roulette-back" onClick={closeOverlay} disabled={phase === "spinning" || phase === "revealing"}><ArrowLeft size={15} /> 돌아가기</button>
              <div className="roulette-title"><span className="eyebrow"><span className="live-dot" /> FULLSCREEN ROULETTE</span><h2>{selectedDraw.name}</h2><p>{message}</p></div>
              <div className="roulette-machine">
                <div className="roulette-pointer" />
                <motion.div
                  key={spinKey}
                  className="roulette-wheel"
                  style={{ background: gradient }}
                  animate={{ rotate: phase === "spinning" || phase === "revealing" || phase === "result" ? rotation : 0 }}
                  transition={{ duration: Math.max(3.2, selectedDraw.animation_ms / 1000), ease: [0.12, 0.78, 0.18, 1] }}
                >
                  {rewards.slice(0, 8).map((reward, index) => {
                    const angle = (360 / Math.max(rewards.length, 1)) * index;
                    return <span key={reward.id} style={{ transform: `rotate(${angle}deg) translateY(-42%) rotate(-${angle}deg)` }}>{reward.name}</span>;
                  })}
                </motion.div>
                <div className="roulette-center"><Trophy size={34} /><span>Dynamic</span></div>
              </div>
              <div className="roulette-result-panel" style={{ "--result-color": result?.rewardColor ?? "#f6c453" } as React.CSSProperties}>
                {phase === "result" && result ? <><Gift size={26} /><strong>{result.rewardName}</strong><span>{result.participantName ?? "나"} · {result.memberCode ?? "내 결과"}</span><button className="btn btn-primary" onClick={closeOverlay}>확인</button></> : phase === "error" ? <><strong>실행 실패</strong><span>{message}</span><button className="btn btn-secondary" onClick={closeOverlay}>닫기</button></> : <><LoaderCircle size={26} className="spin" /><strong>{phase === "revealing" ? "결과 공개 중" : "룰렛 회전 중"}</strong><span>창을 닫지 말고 잠시 기다려 주세요.</span></>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
