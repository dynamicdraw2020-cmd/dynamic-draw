"use client";

import type { CSSProperties } from "react";
import { Dices, Eye, Gift, Radio, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Draw, DrawResult, Reward } from "@/lib/types";
import { maskMemberCode, maskName } from "@/lib/utils";

type Stage = "idle" | "spinning" | "glowing" | "slowing" | "revealed";
type LiveResult = { rewardName: string; rewardColor: string; participantName?: string; memberCode?: string };
type RouletteStyle = CSSProperties & { "--spin-rotation"?: string; "--spin-duration"?: string; "--segment-count"?: number; "--result-color"?: string };

const fallbackSegments = [
  { id: "lose", name: "꽝", color: "#64748b", probability_units: 550000 },
  { id: "ticket", name: "입장권", color: "#38bdf8", probability_units: 400000 },
  { id: "dwx", name: "DwX", color: "#a78bfa", probability_units: 40000 },
  { id: "dynamic", name: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜", color: "#fbbf24", probability_units: 10000 },
] satisfies Array<Pick<Reward, "id" | "name" | "color" | "probability_units">>;

function stageLabel(stage: Stage) {
  return { idle: "다음 추첨 대기 중", spinning: "룰렛이 빠르게 회전 중", glowing: "행운의 빛을 모으는 중", slowing: "룰렛이 멈추는 중", revealed: "추첨 결과가 공개되었습니다" }[stage];
}
function equalWheelGradient(rewards: Array<Pick<Reward, "color">>) {
  if (!rewards.length) return "conic-gradient(#f6c453 0deg 360deg)";
  const span = 360 / rewards.length;
  return `conic-gradient(${rewards.map((reward, index) => `${reward.color} ${index * span}deg ${(index + 1) * span}deg`).join(", ")})`;
}

export function LiveDrawStage({ drawId, initialResult, draw }: { drawId?: string; initialResult?: DrawResult | null; draw?: Draw | null }) {
  const [stage, setStage] = useState<Stage>(initialResult ? "revealed" : "idle");
  const [result, setResult] = useState<LiveResult | null>(initialResult ? { rewardName: initialResult.reward_name, rewardColor: initialResult.reward_color, participantName: initialResult.public_display_name ?? undefined, memberCode: initialResult.public_member_code ?? undefined } : null);
  const [visualRotation, setVisualRotation] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stageRef = useRef<Stage>(stage);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const segments = useMemo(() => { const rewards = (draw?.rewards ?? []).filter((reward) => reward.is_active && reward.probability_units > 0); return rewards.length ? rewards : fallbackSegments; }, [draw?.rewards]);
  const gradient = useMemo(() => equalWheelGradient(segments), [segments]);

  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const beginAnimation = useCallback(() => {
    clearTimers(); setResult(null); setVisualRotation(0); setStage("spinning");
    const duration = draw?.animation_ms ?? 4000;
    const targetRotation = 2520 + Math.round(Math.random() * 360);
    timers.current.push(setTimeout(() => setVisualRotation(targetRotation), 40));
    timers.current.push(setTimeout(() => setStage("glowing"), Math.min(1200, duration * 0.32)));
    timers.current.push(setTimeout(() => setStage("slowing"), Math.min(2750, duration * 0.7)));
  }, [clearTimers, draw?.animation_ms]);
  const reveal = useCallback((payload: Record<string, unknown>) => {
    setResult({ rewardName: String(payload.rewardName ?? payload.reward_name ?? "당첨 상품"), rewardColor: String(payload.rewardColor ?? payload.reward_color ?? "#f6c453"), participantName: payload.participantName ? String(payload.participantName) : undefined, memberCode: payload.memberCode ? String(payload.memberCode) : undefined });
    setStage("revealed");
  }, []);

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => {
    if (!configured) return;
    const supabase = createClient();
    const channel = supabase.channel(`dynamic-draw-live-${drawId ?? "all"}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "live_events" }, (message) => {
      const event = message.new as { draw_id?: string; event_type?: string; payload?: Record<string, unknown> };
      if (drawId && event.draw_id !== drawId) return;
      if (event.event_type === "DRAW_START") beginAnimation();
      if (event.event_type === "DRAW_ANIMATING" && stageRef.current === "idle") beginAnimation();
      if (event.event_type === "DRAW_RESULT") reveal(event.payload ?? {});
    }).subscribe();
    let cancelled = false;
    void (async () => {
      let query = supabase.from("live_events").select("draw_id,event_type,payload,created_at").order("created_at", { ascending: false }).limit(1);
      if (drawId) query = query.eq("draw_id", drawId);
      const { data } = await query.maybeSingle();
      if (cancelled || !data) return;
      const ageMs = Date.now() - new Date(data.created_at).getTime();
      if (["DRAW_START", "DRAW_ANIMATING"].includes(data.event_type) && ageMs < 10_000) beginAnimation();
      if (data.event_type === "DRAW_RESULT") reveal((data.payload as Record<string, unknown>) ?? {});
    })();
    const recovery = setInterval(() => { fetch("/api/live/reveal-due", { method: "POST", keepalive: true }).catch(() => undefined); }, 2500);
    return () => { cancelled = true; clearInterval(recovery); clearTimers(); void supabase.removeChannel(channel); };
  }, [beginAnimation, clearTimers, configured, drawId, reveal]);

  function runDemo() { beginAnimation(); timers.current.push(setTimeout(() => reveal({ rewardName: Math.random() > 0.72 ? "𝐃𝐲𝐧𝐚𝐦𝐢𝐜" : "찢어진 입장권", rewardColor: "#fbbf24", participantName: "데모 회원", memberCode: "DD-2026-000001" }), 4000)); }
  const color = result?.rewardColor ?? "#f6c453";
  const spinning = stage === "spinning" || stage === "glowing" || stage === "slowing";
  const duration = draw?.animation_ms ?? 4000;

  return <section className="panel live-stage roulette-stage" aria-live="polite"><div className="live-top"><span className="live-status"><span className="live-dot" /><Radio size={14} /> LIVE EVENT</span>{!configured && <button className="btn btn-secondary btn-sm" onClick={runDemo} disabled={stage !== "idle" && stage !== "revealed"}><Eye size={14} /> 연출 미리보기</button>}</div>{stage === "glowing" && <div className="stage-glow roulette-glow optimized-glow" />}<div className="roulette-machine live-roulette-machine"><div className="roulette-pointer" /><div className={`roulette-wheel optimized live-roulette-wheel ${spinning || stage === "revealed" ? "is-spinning" : ""}`} style={{ background: gradient, "--spin-rotation": `${visualRotation}deg`, "--spin-duration": `${duration}ms`, "--segment-count": segments.length } as RouletteStyle}>{segments.slice(0, 8).map((reward, index) => { const angle = (360 / Math.max(segments.length, 1)) * index; return <span key={reward.id} style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-clamp(76px, 24vmin, 132px)) rotate(-${angle}deg)` }}>{reward.name}</span>; })}</div><div className="roulette-center"><Trophy size={34} /><span>𝐃𝐲𝐧𝐚𝐦𝐢𝐜</span></div></div><div className="live-result-strip" style={{ "--result-color": color } as RouletteStyle}>{stage === "revealed" && result ? <><Gift size={21} /><strong>{result.rewardName}</strong><span>{maskName(result.participantName ?? null)} · {maskMemberCode(result.memberCode ?? null)}</span></> : <><Dices size={21} /><strong>{stageLabel(stage)}</strong><span>결과는 서버에서 먼저 결정됩니다. 룰렛 칸은 모두 같은 크기입니다.</span></>}</div><p className="stage-message">{stageLabel(stage)}</p></section>;
}
