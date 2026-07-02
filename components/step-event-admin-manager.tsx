"use client";

import { ArrowDown, ArrowUp, Copy, LoaderCircle, Plus, Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { AdminStepEvent, StepEventAdminData, StepEventStepRow, StepRewardItem } from "@/lib/step-event-config";
import {
  STEP_EVENT_REPEAT_TYPES,
  STEP_EVENT_STATUSES,
  STEP_MISSION_LABELS,
  STEP_MISSION_TYPES,
  STEP_REWARD_LABELS,
  STEP_REWARD_TYPES,
  describeStepReward,
} from "@/lib/step-event-config";
import { formatDateTime } from "@/lib/utils";

type ApiPayload = { ok?: boolean; data?: unknown; error?: { message?: string } };

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formPayload(form: HTMLFormElement) {
  const data = Object.fromEntries(new FormData(form).entries()) as Record<string, FormDataEntryValue>;
  return {
    ...data,
    autoReward: data.autoReward === "on" || data.autoReward === "true",
    isActive: data.isActive !== "false",
    participationLimit: Number(data.participationLimit || 1),
    targetValue: Number(data.targetValue || 1),
    sortOrder: Number(data.sortOrder || 999),
    rewardAmount: Number(data.rewardAmount || 1),
    rewardDays: Number(data.rewardDays || data.rewardAmount || 1),
    amount: Number(data.amount || 1),
  };
}

async function postAdmin(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/step-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload;
  if (!response.ok) throw new Error(payload.error?.message ?? "요청을 처리하지 못했습니다.");
  return payload.data ?? payload;
}

function rewardLabel(reward: StepRewardItem, data: StepEventAdminData) {
  const currency = data.resources.currencies.find((item) => item.id === reward.currencyId)?.name;
  const draw = data.resources.draws.find((item) => item.id === reward.drawId)?.name;
  const item = data.resources.rewards.find((entry) => entry.id === reward.rewardId)?.name;
  const box = data.resources.boxes.find((entry) => entry.id === reward.boxId)?.name;
  const coupon = data.resources.coupons.find((entry) => entry.id === reward.couponId)?.name;
  return describeStepReward(reward, { currency, draw, reward: item, box, coupon });
}

function rewardSummary(step: StepEventStepRow, data: StepEventAdminData) {
  if (!step.rewards.length) return "보상 없음";
  return step.rewards.map((reward) => rewardLabel(reward, data)).join(" + ");
}

function RewardFields({ data, prefix = "" }: { data: StepEventAdminData; prefix?: string }) {
  return (
    <>
      <div className="form-row">
        <div className="field">
          <label>보상 타입</label>
          <select className="select" name={`${prefix}rewardType`} defaultValue="CURRENCY">
            {STEP_REWARD_TYPES.map((type) => <option key={type} value={type}>{STEP_REWARD_LABELS[type]}</option>)}
          </select>
        </div>
        <div className="field">
          <label>보상 수량/일수</label>
          <input className="input" name={`${prefix}rewardAmount`} type="number" min="1" defaultValue="1" />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>화폐/포인트</label>
          <select className="select" name={`${prefix}currencyId`}>
            <option value="">선택 없음</option>
            {data.resources.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} {currency.symbol ? `· ${currency.symbol}` : ""}</option>)}
          </select>
        </div>
        <div className="field">
          <label>뽑기</label>
          <select className="select" name={`${prefix}drawId`}>
            <option value="">선택 없음</option>
            {data.resources.draws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>아이템/상품</label>
          <select className="select" name={`${prefix}rewardId`}>
            <option value="">선택 없음</option>
            {data.resources.rewards.map((reward) => <option key={reward.id} value={reward.id}>{reward.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>랜덤박스</label>
          <select className="select" name={`${prefix}boxId`}>
            <option value="">선택 없음</option>
            {data.resources.boxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>쿠폰</label>
          <select className="select" name={`${prefix}couponId`}>
            <option value="">선택 없음</option>
            {data.resources.coupons.map((coupon) => <option key={coupon.id} value={coupon.id}>{coupon.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>보상 표시 메모</label>
          <input className="input" name={`${prefix}rewardLabel`} placeholder="예: STEP 완료 보상" />
        </div>
      </div>

      <div className="field">
        <label>추가 보상 JSON</label>
        <textarea className="textarea" name={`${prefix}extraRewardsJson`} rows={3} placeholder='[{"type":"CURRENCY","amount":500,"currencyId":"..."}]' />
        <small>여러 보상 지급이 필요할 때만 입력하세요. 비워두면 위 보상 1개만 저장됩니다.</small>
      </div>
    </>
  );
}

function StepEditForm({ event, step, data, onDone }: { event: AdminStepEvent; step: StepEventStepRow; data: StepEventAdminData; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      setSaving(true);
      await postAdmin({ action: "update-step", stepId: step.id, ...formPayload(e.currentTarget) });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel panel-pad form-grid" onSubmit={submit}>
      <h3 className="panel-title">{event.title} · STEP 수정</h3>
      <div className="form-row">
        <div className="field"><label>STEP 이름</label><input className="input" name="title" defaultValue={step.title} required /></div>
        <div className="field"><label>순서</label><input className="input" name="sortOrder" type="number" defaultValue={step.sort_order} min="1" /></div>
        <div className="field"><label>목표 수치</label><input className="input" name="targetValue" type="number" defaultValue={step.target_value} min="1" /></div>
      </div>
      <div className="field"><label>설명</label><textarea className="textarea" name="description" rows={2} defaultValue={step.description ?? ""} /></div>
      <div className="form-row">
        <div className="field"><label>미션 종류</label><select className="select" name="missionType" defaultValue={step.mission_type}>{STEP_MISSION_TYPES.map((type) => <option key={type} value={type}>{STEP_MISSION_LABELS[type]}</option>)}</select></div>
        <div className="field"><label>상태</label><select className="select" name="isActive" defaultValue={String(step.is_active)}><option value="true">사용</option><option value="false">중지</option></select></div>
      </div>
      <RewardFields data={data} />
      <div className="notice-box compact">현재 저장된 보상: {rewardSummary(step, data)}</div>
      <div className="table-actions"><button className="btn btn-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Settings size={16} />} STEP 수정 저장</button></div>
    </form>
  );
}

export function StepEventAdminManager({ data }: { data: StepEventAdminData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedEventId, setSelectedEventId] = useState(data.events[0]?.id ?? "");
  const [editingStep, setEditingStep] = useState<{ event: AdminStepEvent; step: StepEventStepRow } | null>(null);

  const selectedEvent = useMemo(() => data.events.find((event) => event.id === selectedEventId) ?? data.events[0] ?? null, [data.events, selectedEventId]);

  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setLoading(action);
      setMessage(null);
      await postAdmin({ action, ...formPayload(form) });
      setMessage({ type: "success", text: success });
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." });
    } finally {
      setLoading(null);
    }
  }

  async function run(body: Record<string, unknown>, success: string) {
    try {
      setLoading(String(body.action));
      setMessage(null);
      await postAdmin(body);
      setMessage({ type: "success", text: success });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="form-grid">
      {message && <div className={`form-message ${message.type}`}>{message.text}</div>}

      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-event", "스탭업 이벤트를 만들었습니다.")}>
        <div className="flex items-center gap-1"><Plus size={19} className="text-gold" /><h2 className="panel-title mb-0">스탭업 이벤트 생성</h2></div>
        <div className="form-row">
          <div className="field"><label>이벤트명</label><input className="input" name="title" required placeholder="예: 신규 회원 성장 미션" /></div>
          <div className="field"><label>상태</label><select className="select" name="status" defaultValue="DRAFT">{STEP_EVENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <div className="field"><label>참여 가능 횟수</label><select className="select" name="repeatType" defaultValue="ONCE">{STEP_EVENT_REPEAT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
        </div>
        <div className="field"><label>설명</label><textarea className="textarea" name="description" rows={2} placeholder="유저 화면에 표시할 설명" /></div>
        <div className="form-row">
          <div className="field"><label>시작일</label><input className="input" type="datetime-local" name="startAt" /></div>
          <div className="field"><label>종료일</label><input className="input" type="datetime-local" name="endAt" /></div>
          <div className="field"><label>이벤트 이미지</label><input className="input" name="imageUrl" placeholder="https://..." /></div>
          <div className="field"><label>참여 제한</label><input className="input" name="participationLimit" type="number" min="1" defaultValue="1" /></div>
        </div>
        <label className="check-row"><input type="checkbox" name="autoReward" /> STEP 완료 시 자동 보상 지급</label>
        <button className="btn btn-primary" disabled={loading === "create-event"}>{loading === "create-event" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 이벤트 생성</button>
      </form>

      <section className="panel panel-pad">
        <h2 className="panel-title">이벤트 목록</h2>
        <div className="table-wrap mt-3">
          <table className="table">
            <thead><tr><th>이벤트</th><th>기간</th><th>참여/보상</th><th>상태</th><th>관리</th></tr></thead>
            <tbody>
              {data.events.length ? data.events.map((event) => (
                <tr key={event.id}>
                  <td><strong>{event.title}</strong><div className="text-muted text-small">{event.description ?? "설명 없음"}</div></td>
                  <td>{event.start_at ? formatDateTime(event.start_at) : "즉시"}<br />~ {event.end_at ? formatDateTime(event.end_at) : "무기한"}</td>
                  <td>{event.stats.participantCount.toLocaleString()}명 참여<br />보상 {event.stats.rewardLogCount.toLocaleString()}건</td>
                  <td>{event.status} · {event.repeat_type}<br />{event.auto_reward ? "자동 지급" : "수동 수령"}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelectedEventId(event.id)}>STEP 관리</button>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => run({ action: "toggle-event", eventId: event.id, status: event.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }, "이벤트 상태를 변경했습니다.")}>{event.status === "ACTIVE" ? "OFF" : "ON"}</button>
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => confirm("이벤트를 보관 처리할까요?") && run({ action: "delete-event", eventId: event.id }, "이벤트를 보관 처리했습니다.")}><Trash2 size={14} /> 보관</button>
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan={5}><div className="empty">스탭업 이벤트가 없습니다.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedEvent && (
        <section className="panel panel-pad form-grid">
          <div className="section-heading compact"><div><p className="eyebrow">STEP MANAGER</p><h2>{selectedEvent.title}</h2></div><span className="badge-soft">{selectedEvent.steps.length.toLocaleString()} STEP</span></div>

          <form className="form-grid" onSubmit={(event) => submit(event, "create-step", "STEP을 추가했습니다.")}>
            <input type="hidden" name="eventId" value={selectedEvent.id} readOnly />
            <div className="form-row">
              <div className="field"><label>STEP 이름</label><input className="input" name="title" required placeholder="예: 댓글 20개 작성" /></div>
              <div className="field"><label>미션 종류</label><select className="select" name="missionType" defaultValue="COMMENT_CREATE">{STEP_MISSION_TYPES.map((type) => <option key={type} value={type}>{STEP_MISSION_LABELS[type]}</option>)}</select></div>
              <div className="field"><label>목표 수치</label><input className="input" name="targetValue" type="number" min="1" defaultValue="1" /></div>
            </div>
            <div className="field"><label>STEP 설명</label><input className="input" name="description" placeholder="유저에게 보여줄 안내" /></div>
            <RewardFields data={data} />
            <button className="btn btn-secondary" disabled={loading === "create-step"}>{loading === "create-step" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} STEP 추가</button>
          </form>

          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>순서</th><th>미션</th><th>목표/보상</th><th>완료/수령</th><th>관리</th></tr></thead>
              <tbody>
                {selectedEvent.steps.length ? selectedEvent.steps.map((step, index) => {
                  const stats = selectedEvent.stats.stepStats.find((item) => item.stepId === step.id);
                  return (
                    <tr key={step.id}>
                      <td>STEP {index + 1}<div className="text-muted text-small">sort {step.sort_order}</div></td>
                      <td><strong>{step.title}</strong><div className="text-muted text-small">{STEP_MISSION_LABELS[step.mission_type]} · {step.description ?? "설명 없음"}</div></td>
                      <td>{step.target_value.toLocaleString()}회<br /><span className="text-muted text-small">{rewardSummary(step, data)}</span></td>
                      <td>{(stats?.completed ?? 0).toLocaleString()} / {(stats?.claimed ?? 0).toLocaleString()}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => run({ action: "move-step", eventId: selectedEvent.id, stepId: step.id, direction: "up" }, "STEP 순서를 변경했습니다.")}><ArrowUp size={14} /></button>
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => run({ action: "move-step", eventId: selectedEvent.id, stepId: step.id, direction: "down" }, "STEP 순서를 변경했습니다.")}><ArrowDown size={14} /></button>
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => setEditingStep({ event: selectedEvent, step })}>수정</button>
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => run({ action: "copy-step", stepId: step.id }, "STEP을 복사했습니다.")}><Copy size={14} /> 복사</button>
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => run({ action: "delete-step", stepId: step.id }, "STEP을 삭제했습니다.")}><Trash2 size={14} /> 삭제</button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={5}><div className="empty">추가된 STEP이 없습니다.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editingStep && <StepEditForm event={editingStep.event} step={editingStep.step} data={data} onDone={() => { setEditingStep(null); setMessage({ type: "success", text: "STEP을 수정했습니다." }); router.refresh(); }} />}
    </div>
  );
}
