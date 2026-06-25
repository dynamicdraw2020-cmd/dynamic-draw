"use client";

import { Dices, Eye, Gift, Radio, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DrawResult } from "@/lib/types";
import { maskMemberCode, maskName } from "@/lib/utils";

type Stage = "idle" | "shaking" | "glowing" | "flipping" | "revealed";
type LiveResult = { rewardName: string; rewardColor: string; participantName?: string; memberCode?: string };

function stageLabel(stage: Stage) {
  return {
    idle: "다음 추첨 대기 중",
    shaking: "카드를 섞고 있습니다",
    glowing: "행운의 빛을 모으는 중",
    flipping: "결과를 공개합니다",
    revealed: "추첨 결과가 공개되었습니다",
  }[stage];
}

export function LiveDrawStage({ drawId, initialResult }: { drawId?: string; initialResult?: DrawResult | null }) {
  const [stage, setStage] = useState<Stage>(initialResult ? "revealed" : "idle");
  const [result, setResult] = useState<LiveResult | null>(
    initialResult
      ? {
          rewardName: initialResult.reward_name,
          rewardColor: initialResult.reward_color,
          participantName: initialResult.public_display_name ?? undefined,
          memberCode: initialResult.public_member_code ?? undefined,
        }
      : null,
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stageRef = useRef<Stage>(stage);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const beginAnimation = useCallback(() => {
    clearTimers();
    setResult(null);
    setStage("shaking");
    timers.current.push(setTimeout(() => setStage("glowing"), 1000));
    timers.current.push(setTimeout(() => setStage("flipping"), 2450));
  }, [clearTimers]);

  const reveal = useCallback((payload: Record<string, unknown>) => {
    const rewardName = String(payload.rewardName ?? payload.reward_name ?? "당첨 상품");
    const rewardColor = String(payload.rewardColor ?? payload.reward_color ?? "#f6c453");
    setResult({
      rewardName,
      rewardColor,
      participantName: payload.participantName ? String(payload.participantName) : undefined,
      memberCode: payload.memberCode ? String(payload.memberCode) : undefined,
    });
    setStage("revealed");
  }, []);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    if (!configured) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`dynamic-draw-live-${drawId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_events" },
        (message) => {
          const event = message.new as { draw_id?: string; event_type?: string; payload?: Record<string, unknown> };
          if (drawId && event.draw_id !== drawId) return;
          if (event.event_type === "DRAW_START") beginAnimation();
          if (event.event_type === "DRAW_ANIMATING" && stageRef.current === "idle") beginAnimation();
          if (event.event_type === "DRAW_RESULT") reveal(event.payload ?? {});
        },
      )
      .subscribe();

    let cancelled = false;
    void (async () => {
      let query = supabase
        .from("live_events")
        .select("draw_id,event_type,payload,created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (drawId) query = query.eq("draw_id", drawId);
      const { data } = await query.maybeSingle();
      if (cancelled || !data) return;
      const ageMs = Date.now() - new Date(data.created_at).getTime();
      if (["DRAW_START", "DRAW_ANIMATING"].includes(data.event_type) && ageMs < 10_000) beginAnimation();
      if (data.event_type === "DRAW_RESULT") reveal((data.payload as Record<string, unknown>) ?? {});
    })();

    const recovery = setInterval(() => {
      fetch("/api/live/reveal-due", { method: "POST", keepalive: true }).catch(() => undefined);
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(recovery);
      clearTimers();
      void supabase.removeChannel(channel);
    };
  }, [beginAnimation, clearTimers, configured, drawId, reveal]);

  function runDemo() {
    const isDynamic = Math.random() > 0.72;
    beginAnimation();
    timers.current.push(
      setTimeout(
        () =>
          reveal({
            rewardName: isDynamic ? "Dynamic" : "찢어진 입장권",
            rewardColor: isDynamic ? "#fbbf24" : "#38bdf8",
            participantName: "데모 회원",
            memberCode: "DD-2026-000001",
          }),
        4000,
      ),
    );
  }

  const isFlipped = stage === "flipping" || stage === "revealed";
  const color = result?.rewardColor ?? "#f6c453";

  return (
    <section className="panel live-stage" aria-live="polite">
      <div className="live-top">
        <span className="live-status"><span className="live-dot" /><Radio size={14} /> LIVE</span>
        {!configured && <button className="btn btn-secondary btn-sm" onClick={runDemo} disabled={stage !== "idle" && stage !== "revealed"}><Eye size={14} /> 연출 미리보기</button>}
      </div>

      <AnimatePresence>{stage === "glowing" && <motion.div className="stage-glow" initial={{ opacity: 0, scale: .55 }} animate={{ opacity: 1, scale: 1.2 }} exit={{ opacity: 0 }} transition={{ duration: .75 }} />}</AnimatePresence>

      <div className="draw-card-shell">
        <motion.div
          className="draw-card-3d"
          animate={{
            x: stage === "shaking" ? [0, -10, 9, -7, 6, 0] : 0,
            rotate: stage === "shaking" ? [0, -2.5, 2.5, -1.5, 1, 0] : 0,
            rotateY: isFlipped ? 180 : 0,
            scale: stage === "glowing" ? [1, 1.055, 1] : 1,
          }}
          transition={
            stage === "shaking"
              ? { duration: .72, repeat: 1 }
              : isFlipped
                ? { duration: .85, ease: [0.22, 1, 0.36, 1] }
                : { duration: .6 }
          }
        >
          <div className="draw-card-face draw-card-back">
            <div className="draw-card-glyph">{stage === "glowing" ? <Sparkles size={56} /> : <Dices size={58} />}</div>
            <h3>Dynamic Draw</h3>
            <p>결과는 서버에서 안전하게 먼저 결정됩니다.</p>
          </div>
          <div className="draw-card-face draw-card-front" style={{ "--result-color": color } as React.CSSProperties}>
            <div className="draw-card-glyph result-glyph"><Gift size={54} /></div>
            <h3>{result?.rewardName ?? "결과 확인 중"}</h3>
            <p>{result ? `${maskName(result.participantName ?? null)} · ${maskMemberCode(result.memberCode ?? null)}` : "잠시만 기다려 주세요."}</p>
          </div>
        </motion.div>
      </div>
      <p className="stage-message">{stageLabel(stage)}</p>
    </section>
  );
}
