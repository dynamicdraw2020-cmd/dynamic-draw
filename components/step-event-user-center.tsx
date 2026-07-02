"use client";

import { CheckCircle2, Gift, LockKeyhole, LoaderCircle, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserStepEvent, StepRewardItem } from "@/lib/step-event-config";
import { STEP_MISSION_LABELS, describeStepReward } from "@/lib/step-event-config";
import { formatDateTime } from "@/lib/utils";

type ApiPayload = { ok?: boolean; data?: unknown; error?: { message?: string } };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload;
  if (!response.ok) throw new Error(payload.error?.message ?? "요청을 처리하지 못했습니다.");
  return payload.data ?? payload;
}

function rewardText(rewards: StepRewardItem[]) {
  if (!rewards.length) return "보상 없음";
  return rewards.map((reward) => describeStepReward(reward)).join(" + ");
}

export function StepEventUserCenter({ events }: { events: UserStepEvent[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function claim(eventId: string, stepId: string) {
    try {
      setLoading(stepId);
      setMessage(null);
      await postJson("/api/step-events/claim", { eventId, stepId });
      setMessage({ type: "success", text: "STEP 보상을 수령했습니다." });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "보상을 수령하지 못했습니다." });
    } finally {
      setLoading(null);
    }
  }

  if (!events.length) {
    return <div className="empty">현재 진행 중인 스탭업 미션 이벤트가 없습니다.</div>;
  }

  return (
    <div className="form-grid">
      {message && <div className={`form-message ${message.type}`}>{message.text}</div>}

      {events.map((event) => (
        <section className="panel panel-pad" key={event.id}>
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">STEP EVENT</p>
              <h2>{event.title}</h2>
              {event.description && <p>{event.description}</p>}
            </div>
            <span className="badge-soft">{event.completed_count.toLocaleString()} / {event.total_steps.toLocaleString()} 완료</span>
          </div>

          {(event.start_at || event.end_at) && (
            <p className="text-muted text-small">
              기간 {event.start_at ? formatDateTime(event.start_at) : "즉시"} ~ {event.end_at ? formatDateTime(event.end_at) : "무기한"}
            </p>
          )}

          <div className="form-grid mt-3">
            {event.steps.map((step, index) => {
              const canClaim = !step.locked && step.completed && !step.claimed;
              return (
                <article className="panel panel-pad" key={step.id} style={{ opacity: step.locked ? 0.62 : 1 }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="eyebrow">STEP {index + 1}</p>
                      <h3 className="panel-title mb-0">{step.title}</h3>
                    </div>
                    {step.locked ? <span className="badge-soft"><LockKeyhole size={14} /> 잠금</span> : step.claimed ? <span className="badge-soft"><CheckCircle2 size={14} /> 수령 완료</span> : <span className="badge-soft"><Trophy size={14} /> 진행 중</span>}
                  </div>

                  {step.description && <p className="text-muted mt-2">{step.description}</p>}

                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-2 text-small">
                      <strong>{STEP_MISSION_LABELS[step.mission_type] ?? step.mission_type}</strong>
                      <span>{step.current_value.toLocaleString()} / {step.target_value.toLocaleString()} · {step.progress_percent}%</span>
                    </div>
                    <div aria-label="진행률" style={{ background: "rgba(148, 163, 184, 0.22)", borderRadius: 999, height: 10, marginTop: 8, overflow: "hidden" }}>
                      <div style={{ background: "currentColor", borderRadius: 999, height: "100%", opacity: 0.55, width: `${step.progress_percent}%` }} />
                    </div>
                  </div>

                  <div className="notice-box compact mt-3">
                    <Gift size={16} /> 보상: {rewardText(step.rewards)}
                  </div>

                  <div className="table-actions mt-3">
                    <button className="btn btn-primary btn-sm" type="button" disabled={!canClaim || loading === step.id} onClick={() => claim(event.id, step.id)}>
                      {loading === step.id ? <LoaderCircle size={16} className="spin" /> : <Gift size={16} />}
                      {step.claimed ? "수령 완료" : canClaim ? "보상 받기" : step.locked ? "이전 STEP 필요" : "진행 중"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
