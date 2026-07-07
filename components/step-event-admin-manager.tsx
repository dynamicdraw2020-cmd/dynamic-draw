"use client";

import { ArrowDown, ArrowUp, Copy, LoaderCircle, Plus, Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type {
  AdminStepEvent,
  StepEventAdminData,
  StepEventRepeatType,
  StepEventStatus,
  StepEventStepRow,
  StepMissionType,
  StepRewardItem,
  StepRewardType,
} from "@/lib/step-event-config";
import {
  STEP_EVENT_REPEAT_HELP,
  STEP_EVENT_REPEAT_LABELS,
  STEP_EVENT_REPEAT_TYPES,
  STEP_EVENT_STATUS_HELP,
  STEP_EVENT_STATUS_LABELS,
  STEP_EVENT_STATUSES,
  STEP_MISSION_HELP,
  STEP_MISSION_LABELS,
  STEP_MISSION_TYPES,
  STEP_REWARD_LABELS,
  STEP_REWARD_TYPES,
  describeStepReward,
} from "@/lib/step-event-config";
import { formatDateTime } from "@/lib/utils";

type ApiPayload = { ok?: boolean; data?: unknown; error?: { message?: string } };

type QuickPreset = {
  id: string;
  label: string;
  help: string;
  title: string;
  description: string;
  stepTitle: string;
  stepDescription: string;
  status: StepEventStatus;
  repeatType: StepEventRepeatType;
  missionType: StepMissionType;
  targetValue: number;
  autoReward: boolean;
  reward: StepRewardItem;
};

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: "signup",
    label: "신규가입 1STEP",
    help: "회원가입만 완료하면 바로 보상을 주는 가장 쉬운 스탭업입니다.",
    title: "신규 회원 첫 보상",
    description: "회원가입을 완료한 신규 회원에게 첫 보상을 지급합니다.",
    stepTitle: "회원가입 완료",
    stepDescription: "회원가입이 완료되면 자동으로 1회 반영됩니다.",
    status: "DRAFT",
    repeatType: "ONCE",
    missionType: "SIGNUP",
    targetValue: 1,
    autoReward: true,
    reward: { type: "EXP", amount: 50, label: "신규 회원 스탭업" },
  },
  {
    id: "login3",
    label: "로그인 3일",
    help: "회원이 로그인할 때마다 진행도가 올라갑니다. 짧은 복귀 이벤트에 좋아요.",
    title: "3회 로그인 복귀 미션",
    description: "기간 안에 로그인 3회를 달성하면 보상을 받을 수 있습니다.",
    stepTitle: "로그인 3회 완료",
    stepDescription: "로그인할 때마다 자동으로 1회 반영됩니다.",
    status: "DRAFT",
    repeatType: "ONCE",
    missionType: "LOGIN",
    targetValue: 3,
    autoReward: true,
    reward: { type: "EXP", amount: 100, label: "로그인 미션" },
  },
  {
    id: "attendance7",
    label: "출석 7일",
    help: "출석 버튼을 누를 때마다 진행도가 올라갑니다. 주간 이벤트로 쓰기 좋아요.",
    title: "7일 출석 스탭업",
    description: "출석을 7회 완료하면 보상을 받을 수 있습니다.",
    stepTitle: "출석 7회 달성",
    stepDescription: "보상센터에서 출석하면 자동으로 1회 반영됩니다.",
    status: "DRAFT",
    repeatType: "ONCE",
    missionType: "ATTENDANCE",
    targetValue: 7,
    autoReward: false,
    reward: { type: "EXP", amount: 300, label: "출석 7일 보상" },
  },
  {
    id: "coupon",
    label: "쿠폰 사용 1회",
    help: "보상센터에서 쿠폰/이벤트 코드를 사용하면 진행도가 올라갑니다.",
    title: "쿠폰 사용 미션",
    description: "이벤트 코드를 사용한 회원에게 추가 보상을 지급합니다.",
    stepTitle: "쿠폰 코드 사용",
    stepDescription: "쿠폰 또는 이벤트 코드를 정상 사용하면 자동 반영됩니다.",
    status: "DRAFT",
    repeatType: "ONCE",
    missionType: "COUPON_USE",
    targetValue: 1,
    autoReward: true,
    reward: { type: "EXP", amount: 100, label: "쿠폰 사용 보상" },
  },
  {
    id: "manual",
    label: "관리자 수동 지급",
    help: "자동 추적이 아직 없는 미션은 관리자 수동 진행으로 먼저 운영할 수 있습니다.",
    title: "관리자 수동 스탭업",
    description: "운영자가 직접 회원의 진행도를 올려주는 테스트/수동 미션입니다.",
    stepTitle: "관리자 확인 미션",
    stepDescription: "관리자가 아래 수동 진행 도구에서 회원을 선택해 진행도를 올립니다.",
    status: "DRAFT",
    repeatType: "ONCE",
    missionType: "ADMIN_GRANT",
    targetValue: 1,
    autoReward: false,
    reward: { type: "OTHER", amount: 1, label: "관리자 수동 확인" },
  },
];

const AUTO_TRACKED_MISSIONS: StepMissionType[] = ["SIGNUP", "LOGIN", "ATTENDANCE", "RANDOM_BOX_OPEN", "COUPON_USE", "ADMIN_GRANT"];

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

function resourceWarning(type: StepRewardType, data: StepEventAdminData) {
  if (type === "CURRENCY" && !data.resources.currencies.length) return "포인트/화폐 목록이 비어 있습니다. 먼저 화폐를 만들거나 EXP/기타 보상을 선택하세요.";
  if (type === "TICKET" && !data.resources.draws.length) return "뽑기 목록이 비어 있습니다. 먼저 뽑기를 만들거나 다른 보상을 선택하세요.";
  if (type === "ITEM" && !data.resources.rewards.length) return "아이템/상품 목록이 비어 있습니다. 먼저 상품을 만들거나 다른 보상을 선택하세요.";
  if (type === "RANDOM_BOX" && !data.resources.boxes.length) return "랜덤박스 목록이 비어 있습니다. 먼저 랜덤박스를 만들거나 다른 보상을 선택하세요.";
  if (type === "COUPON" && !data.resources.coupons.length) return "쿠폰 목록이 비어 있습니다. 먼저 쿠폰을 만들거나 다른 보상을 선택하세요.";
  return null;
}

function RewardFields({ data, prefix = "", defaultRewards = [] }: { data: StepEventAdminData; prefix?: string; defaultRewards?: StepRewardItem[] }) {
  const primary = defaultRewards[0];
  const extraRewards = defaultRewards.slice(1);
  const [rewardType, setRewardType] = useState<StepRewardType>(primary?.type ?? "EXP");
  const warning = resourceWarning(rewardType, data);

  return (
    <div className="stepup-reward-box">
      <div className="stepup-mini-head">
        <strong>보상 설정</strong>
        <span>보상 타입을 고르면 필요한 선택지만 보여요.</span>
      </div>

      <div className="form-row">
        <div className="field">
          <label>보상 타입</label>
          <select className="select" name={`${prefix}rewardType`} value={rewardType} onChange={(event) => setRewardType(event.target.value as StepRewardType)}>
            {STEP_REWARD_TYPES.map((type) => <option key={type} value={type}>{STEP_REWARD_LABELS[type]}</option>)}
          </select>
          <small>{rewardType === "OTHER" || rewardType === "ADMIN_GRANT" ? "자동 지급 대신 관리자 확인용 보상으로 기록됩니다." : "실제 지급하려면 아래 대상 선택이 필요한 보상은 꼭 대상을 선택하세요."}</small>
        </div>
        <div className="field">
          <label>보상 수량/일수</label>
          <input className="input" name={`${prefix}rewardAmount`} type="number" min="1" defaultValue={primary?.amount ?? 1} />
          <small>VIP는 일수, 뽑기권/랜덤박스/아이템은 개수, EXP/포인트는 수량입니다.</small>
        </div>
      </div>

      {warning && <div className="form-message info">{warning}</div>}

      {rewardType === "CURRENCY" && (
        <div className="field">
          <label>지급할 화폐/포인트</label>
          <select className="select" name={`${prefix}currencyId`} defaultValue={primary?.currencyId ?? ""} required>
            <option value="">선택 필요</option>
            {data.resources.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} {currency.symbol ? `· ${currency.symbol}` : ""}</option>)}
          </select>
        </div>
      )}

      {rewardType === "TICKET" && (
        <div className="field">
          <label>지급할 뽑기권</label>
          <select className="select" name={`${prefix}drawId`} defaultValue={primary?.drawId ?? ""} required>
            <option value="">선택 필요</option>
            {data.resources.draws.map((draw) => <option key={draw.id} value={draw.id}>{draw.name}</option>)}
          </select>
        </div>
      )}

      {rewardType === "ITEM" && (
        <div className="field">
          <label>지급할 아이템/상품</label>
          <select className="select" name={`${prefix}rewardId`} defaultValue={primary?.rewardId ?? ""} required>
            <option value="">선택 필요</option>
            {data.resources.rewards.map((reward) => <option key={reward.id} value={reward.id}>{reward.name}</option>)}
          </select>
        </div>
      )}

      {rewardType === "RANDOM_BOX" && (
        <div className="field">
          <label>지급할 랜덤박스</label>
          <select className="select" name={`${prefix}boxId`} defaultValue={primary?.boxId ?? ""} required>
            <option value="">선택 필요</option>
            {data.resources.boxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}
          </select>
        </div>
      )}

      {rewardType === "COUPON" && (
        <div className="field">
          <label>지급할 쿠폰</label>
          <select className="select" name={`${prefix}couponId`} defaultValue={primary?.couponId ?? ""} required>
            <option value="">선택 필요</option>
            {data.resources.coupons.map((coupon) => <option key={coupon.id} value={coupon.id}>{coupon.name}</option>)}
          </select>
          <small>쿠폰 보상은 알림으로 쿠폰 코드를 안내하는 방식입니다.</small>
        </div>
      )}

      <div className="field">
        <label>보상 표시 메모</label>
        <input className="input" name={`${prefix}rewardLabel`} defaultValue={primary?.label ?? ""} placeholder="예: STEP 완료 보상" />
      </div>

      <details className="stepup-details">
        <summary>고급: 여러 보상을 JSON으로 추가</summary>
        <div className="field mt-2">
          <label>추가 보상 JSON</label>
          <textarea className="textarea" name={`${prefix}extraRewardsJson`} rows={3} defaultValue={extraRewards.length ? JSON.stringify(extraRewards, null, 2) : ""} placeholder='[{"type":"TICKET","amount":3,"drawId":"..."}]' />
          <small>여러 보상 지급이 필요할 때만 입력하세요. 비워두면 위 보상 1개만 저장됩니다.</small>
        </div>
      </details>
    </div>
  );
}

function StepUsageGuide() {
  return (
    <section className="panel panel-pad stepup-guide">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">빠른 사용법</p>
          <h2>스탭업은 이렇게 설정하면 돼요</h2>
          <p>처음에는 프리셋으로 만들고, 정상 작동 확인 후 STEP을 추가하는 방식이 가장 안전합니다.</p>
        </div>
      </div>
      <div className="stepup-guide-grid">
        <article><strong>1. 프리셋 선택</strong><span>신규가입, 로그인, 출석, 쿠폰 사용 중 하나를 골라 기본 이벤트와 STEP을 한 번에 만듭니다.</span></article>
        <article><strong>2. 보상 선택</strong><span>EXP는 바로 쓰기 쉽고, 포인트/뽑기권/랜덤박스/쿠폰은 대상 항목을 먼저 만들어야 실제 지급됩니다.</span></article>
        <article><strong>3. ACTIVE 전환</strong><span>DRAFT는 관리자만 관리하는 상태입니다. 유저에게 보여주려면 이벤트 목록에서 ON을 눌러 ACTIVE로 켜세요.</span></article>
        <article><strong>4. 진행도 확인</strong><span>유저가 미션을 수행하면 진행도가 올라갑니다. 필요하면 아래 수동 진행 도구로 테스트할 수 있습니다.</span></article>
      </div>
    </section>
  );
}

function MissionGuide() {
  return (
    <details className="panel panel-pad stepup-details" open>
      <summary>미션 종류별 작동 방식 보기</summary>
      <div className="stepup-mission-grid mt-3">
        {STEP_MISSION_TYPES.map((type) => (
          <article key={type} className={AUTO_TRACKED_MISSIONS.includes(type) ? "auto" : "manual"}>
            <strong>{STEP_MISSION_LABELS[type]}</strong>
            <span>{STEP_MISSION_HELP[type]}</span>
            <em>{AUTO_TRACKED_MISSIONS.includes(type) ? "자동 반영 가능" : "추가 연동/수동 진행 권장"}</em>
          </article>
        ))}
      </div>
    </details>
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
        <div className="field">
          <label>미션 종류</label>
          <select className="select" name="missionType" defaultValue={step.mission_type}>{STEP_MISSION_TYPES.map((type) => <option key={type} value={type}>{STEP_MISSION_LABELS[type]}</option>)}</select>
          <small>{STEP_MISSION_HELP[step.mission_type]}</small>
        </div>
        <div className="field"><label>상태</label><select className="select" name="isActive" defaultValue={String(step.is_active)}><option value="true">사용</option><option value="false">중지</option></select></div>
      </div>
      <RewardFields data={data} defaultRewards={step.rewards} />
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
  const [quickPresetId, setQuickPresetId] = useState(QUICK_PRESETS[0].id);

  const selectedEvent = useMemo(() => data.events.find((event) => event.id === selectedEventId) ?? data.events[0] ?? null, [data.events, selectedEventId]);
  const quickPreset = QUICK_PRESETS.find((preset) => preset.id === quickPresetId) ?? QUICK_PRESETS[0];

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
    <div className="form-grid stepup-admin-manager">
      {message && <div className={`form-message ${message.type}`}>{message.text}</div>}

      <StepUsageGuide />

      <form key={quickPreset.id} className="panel panel-pad form-grid stepup-quick-form" onSubmit={(event) => submit(event, "quick-create", "프리셋으로 스탭업 이벤트와 STEP을 만들었습니다.")}>
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">QUICK START</p>
            <h2 className="panel-title mb-0">프리셋으로 바로 만들기</h2>
            <p>처음 설정할 때는 이 폼 하나만 채우면 이벤트 + 첫 STEP까지 한 번에 생성됩니다.</p>
          </div>
        </div>

        <div className="field">
          <label>프리셋</label>
          <select className="select" value={quickPreset.id} onChange={(event) => setQuickPresetId(event.target.value)}>
            {QUICK_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <small>{quickPreset.help}</small>
        </div>

        <div className="form-row">
          <div className="field"><label>이벤트명</label><input className="input" name="title" required defaultValue={quickPreset.title} /></div>
          <div className="field">
            <label>상태</label>
            <select className="select" name="status" defaultValue={quickPreset.status}>{STEP_EVENT_STATUSES.map((status) => <option key={status} value={status}>{STEP_EVENT_STATUS_LABELS[status]}</option>)}</select>
            <small>DRAFT로 만들고 확인 후 ON 하는 걸 추천합니다.</small>
          </div>
        </div>
        <div className="field"><label>이벤트 설명</label><textarea className="textarea" name="description" rows={2} defaultValue={quickPreset.description} /></div>

        <div className="form-row">
          <div className="field">
            <label>반복 기준</label>
            <select className="select" name="repeatType" defaultValue={quickPreset.repeatType}>{STEP_EVENT_REPEAT_TYPES.map((type) => <option key={type} value={type}>{STEP_EVENT_REPEAT_LABELS[type]}</option>)}</select>
            <small>{STEP_EVENT_REPEAT_HELP[quickPreset.repeatType]}</small>
          </div>
          <div className="field"><label>참여 제한</label><input className="input" name="participationLimit" type="number" min="1" defaultValue="1" /><small>대부분 1이면 충분합니다.</small></div>
        </div>

        <div className="form-row">
          <div className="field"><label>시작일</label><input className="input" type="datetime-local" name="startAt" /><small>비워두면 즉시 시작 기준입니다.</small></div>
          <div className="field"><label>종료일</label><input className="input" type="datetime-local" name="endAt" /><small>비워두면 무기한입니다.</small></div>
        </div>

        <div className="form-row">
          <div className="field"><label>STEP 이름</label><input className="input" name="stepTitle" required defaultValue={quickPreset.stepTitle} /></div>
          <div className="field">
            <label>미션 종류</label>
            <select className="select" name="missionType" defaultValue={quickPreset.missionType}>{STEP_MISSION_TYPES.map((type) => <option key={type} value={type}>{STEP_MISSION_LABELS[type]}</option>)}</select>
            <small>{STEP_MISSION_HELP[quickPreset.missionType]}</small>
          </div>
          <div className="field"><label>목표 수치</label><input className="input" name="targetValue" type="number" min="1" defaultValue={quickPreset.targetValue} /><small>예: 로그인 3회면 3, 출석 7회면 7</small></div>
        </div>
        <div className="field"><label>STEP 설명</label><input className="input" name="stepDescription" defaultValue={quickPreset.stepDescription} /></div>

        <label className="check-row"><input type="checkbox" name="autoReward" defaultChecked={quickPreset.autoReward} /> STEP 완료 시 자동 보상 지급</label>
        <RewardFields data={data} defaultRewards={[quickPreset.reward]} />
        <button className="btn btn-primary" disabled={loading === "quick-create"}>{loading === "quick-create" ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 프리셋으로 이벤트 + STEP 만들기</button>
      </form>

      <form className="panel panel-pad form-grid" onSubmit={(event) => submit(event, "create-event", "스탭업 이벤트를 만들었습니다.")}>
        <div className="flex items-center gap-1"><Plus size={19} className="text-gold" /><h2 className="panel-title mb-0">이벤트만 직접 생성</h2></div>
        <div className="notice-box compact">프리셋이 아니라 처음부터 직접 만들고 싶을 때 사용하세요. 이벤트 생성 후 아래 STEP 관리에서 미션을 추가해야 유저에게 할 일이 생깁니다.</div>
        <div className="form-row">
          <div className="field"><label>이벤트명</label><input className="input" name="title" required placeholder="예: 신규 회원 성장 미션" /></div>
          <div className="field"><label>상태</label><select className="select" name="status" defaultValue="DRAFT">{STEP_EVENT_STATUSES.map((status) => <option key={status} value={status}>{STEP_EVENT_STATUS_LABELS[status]}</option>)}</select><small>{STEP_EVENT_STATUS_HELP.DRAFT}</small></div>
          <div className="field"><label>반복 기준</label><select className="select" name="repeatType" defaultValue="ONCE">{STEP_EVENT_REPEAT_TYPES.map((type) => <option key={type} value={type}>{STEP_EVENT_REPEAT_LABELS[type]}</option>)}</select><small>ONCE가 제일 안전합니다.</small></div>
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
                  <td>{STEP_EVENT_STATUS_LABELS[event.status]} · {STEP_EVENT_REPEAT_LABELS[event.repeat_type]}<br />{event.auto_reward ? "자동 지급" : "수동 수령"}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelectedEventId(event.id)}>STEP 관리</button>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => run({ action: "toggle-event", eventId: event.id, status: event.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }, "이벤트 상태를 변경했습니다.")}>{event.status === "ACTIVE" ? "OFF" : "ON"}</button>
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => confirm("이벤트를 보관 처리할까요?") && run({ action: "delete-event", eventId: event.id }, "이벤트를 보관 처리했습니다.")}><Trash2 size={14} /> 보관</button>
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan={5}><div className="empty">스탭업 이벤트가 없습니다. 위 프리셋으로 먼저 하나 만들어보세요.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedEvent && (
        <section className="panel panel-pad form-grid">
          <div className="section-heading compact"><div><p className="eyebrow">STEP MANAGER</p><h2>{selectedEvent.title}</h2><p>STEP은 위에서 아래 순서대로 진행됩니다. 다음 STEP은 이전 STEP 보상을 받은 뒤 열립니다.</p></div><span className="badge-soft">{selectedEvent.steps.length.toLocaleString()} STEP</span></div>

          <form className="form-grid" onSubmit={(event) => submit(event, "create-step", "STEP을 추가했습니다.")}>
            <input type="hidden" name="eventId" value={selectedEvent.id} readOnly />
            <div className="form-row">
              <div className="field"><label>STEP 이름</label><input className="input" name="title" required placeholder="예: 댓글 20개 작성" /></div>
              <div className="field"><label>미션 종류</label><select className="select" name="missionType" defaultValue="ADMIN_GRANT">{STEP_MISSION_TYPES.map((type) => <option key={type} value={type}>{STEP_MISSION_LABELS[type]}</option>)}</select><small>처음 테스트는 관리자 지급을 추천합니다.</small></div>
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

      <section className="panel panel-pad form-grid">
        <div className="section-heading compact"><div><p className="eyebrow">TEST TOOL</p><h2>수동 진행/테스트</h2><p>자동 연동 전에도 회원을 선택해서 미션 진행도를 올려볼 수 있습니다. 실제 운영 데이터에 반영됩니다.</p></div></div>
        <form className="form-grid" onSubmit={(event) => submit(event, "admin-progress", "선택한 회원의 스탭업 진행도를 반영했습니다.")}>
          <div className="form-row">
            <div className="field">
              <label>회원</label>
              <select className="select" name="profileId" required>
                <option value="">회원 선택</option>
                {data.resources.members.map((member) => <option key={member.id} value={member.id}>{member.name}{member.code ? ` · ${member.code}` : ""}</option>)}
              </select>
              <small>목록이 비어 있으면 회원 관리에서 승인 회원이 있는지 확인하세요.</small>
            </div>
            <div className="field"><label>미션 종류</label><select className="select" name="missionType" defaultValue="ADMIN_GRANT">{STEP_MISSION_TYPES.map((type) => <option key={type} value={type}>{STEP_MISSION_LABELS[type]}</option>)}</select></div>
            <div className="field"><label>증가량</label><input className="input" type="number" min="1" name="amount" defaultValue="1" /></div>
          </div>
          <div className="field"><label>메모</label><input className="input" name="memo" defaultValue="관리자 수동 진행" /></div>
          <button className="btn btn-secondary" disabled={loading === "admin-progress"}>{loading === "admin-progress" ? <LoaderCircle size={17} className="spin" /> : <Settings size={17} />} 진행도 반영</button>
        </form>
      </section>

      <MissionGuide />

      {editingStep && <StepEditForm event={editingStep.event} step={editingStep.step} data={data} onDone={() => { setEditingStep(null); setMessage({ type: "success", text: "STEP을 수정했습니다." }); router.refresh(); }} />}
    </div>
  );
}
