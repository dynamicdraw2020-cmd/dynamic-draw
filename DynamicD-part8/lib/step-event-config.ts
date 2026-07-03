export const STEP_EVENT_REPEAT_TYPES = ["ONCE", "DAILY", "WEEKLY", "SEASON"] as const;
export type StepEventRepeatType = (typeof STEP_EVENT_REPEAT_TYPES)[number];

export const STEP_EVENT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ENDED", "ARCHIVED"] as const;
export type StepEventStatus = (typeof STEP_EVENT_STATUSES)[number];

export const STEP_MISSION_TYPES = [
  "SIGNUP",
  "LOGIN",
  "ATTENDANCE",
  "POST_CREATE",
  "COMMENT_CREATE",
  "LIKE",
  "POINT_EARN",
  "POINT_SPEND",
  "RANDOM_BOX_OPEN",
  "EVENT_PARTICIPATE",
  "DONATION",
  "FRIEND_INVITE",
  "COUPON_USE",
  "ADMIN_GRANT",
  "OTHER",
] as const;
export type StepMissionType = (typeof STEP_MISSION_TYPES)[number];

export const STEP_REWARD_TYPES = [
  "CURRENCY",
  "TICKET",
  "RANDOM_BOX",
  "COUPON",
  "TITLE",
  "BADGE",
  "ITEM",
  "VIP",
  "EXP",
  "ADMIN_GRANT",
  "OTHER",
] as const;
export type StepRewardType = (typeof STEP_REWARD_TYPES)[number];

export type CouponVisibility = "public" | "hidden" | "admin_only" | "event_only";

export type StepRewardItem = {
  type: StepRewardType;
  amount?: number;
  currencyId?: string | null;
  drawId?: string | null;
  rewardId?: string | null;
  boxId?: string | null;
  couponId?: string | null;
  label?: string | null;
  days?: number | null;
  meta?: Record<string, unknown> | null;
};

export type StepEventRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  start_at: string | null;
  end_at: string | null;
  status: StepEventStatus;
  repeat_type: StepEventRepeatType;
  auto_reward: boolean;
  participation_limit: number;
  created_at: string;
  updated_at?: string | null;
};

export type StepEventStepRow = {
  id: string;
  event_id: string;
  step_no: number;
  title: string;
  description: string | null;
  mission_type: StepMissionType;
  target_value: number;
  rewards: StepRewardItem[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type UserStepEventStep = StepEventStepRow & {
  current_value: number;
  progress_percent: number;
  period_key: string;
  locked: boolean;
  completed: boolean;
  claimed: boolean;
  completed_at: string | null;
  claimed_at: string | null;
};

export type UserStepEvent = StepEventRow & {
  steps: UserStepEventStep[];
  participant_status: string | null;
  completed_count: number;
  total_steps: number;
};

export type StepEventAdminStats = {
  participantCount: number;
  completedParticipantCount: number;
  rewardLogCount: number;
  stepStats: Array<{ stepId: string; completed: number; claimed: number }>;
};

export type AdminStepEvent = StepEventRow & {
  steps: StepEventStepRow[];
  stats: StepEventAdminStats;
};

export type StepEventResourceOption = {
  id: string;
  name: string;
  code?: string | null;
  symbol?: string | null;
  status?: string | null;
};

export type StepEventAdminData = {
  events: AdminStepEvent[];
  resources: {
    currencies: StepEventResourceOption[];
    draws: StepEventResourceOption[];
    rewards: StepEventResourceOption[];
    boxes: StepEventResourceOption[];
    coupons: StepEventResourceOption[];
  };
};

export const STEP_MISSION_LABELS: Record<StepMissionType, string> = {
  SIGNUP: "회원가입",
  LOGIN: "로그인",
  ATTENDANCE: "출석",
  POST_CREATE: "게시글 작성",
  COMMENT_CREATE: "댓글 작성",
  LIKE: "좋아요",
  POINT_EARN: "포인트 획득",
  POINT_SPEND: "포인트 사용",
  RANDOM_BOX_OPEN: "랜덤박스 오픈",
  EVENT_PARTICIPATE: "이벤트 참여",
  DONATION: "후원",
  FRIEND_INVITE: "친구 초대",
  COUPON_USE: "쿠폰 사용",
  ADMIN_GRANT: "관리자 지급",
  OTHER: "기타",
};

export const STEP_REWARD_LABELS: Record<StepRewardType, string> = {
  CURRENCY: "포인트/화폐",
  TICKET: "뽑기권",
  RANDOM_BOX: "랜덤박스",
  COUPON: "쿠폰",
  TITLE: "칭호",
  BADGE: "배지",
  ITEM: "아이템/상품",
  VIP: "VIP",
  EXP: "경험치",
  ADMIN_GRANT: "관리자 지급",
  OTHER: "기타",
};

export const COUPON_VISIBILITY_LABELS: Record<CouponVisibility, string> = {
  public: "공개",
  hidden: "숨김",
  admin_only: "관리자 전용",
  event_only: "이벤트 전용",
};

export const COUPON_VISIBILITY_HELP: Record<CouponVisibility, string> = {
  public: "보상센터 목록에 노출되고 코드 입력도 가능합니다.",
  hidden: "목록에는 숨기지만 코드 입력, 이벤트 자동 지급, 관리자 지급은 가능합니다.",
  admin_only: "목록과 코드 입력은 막고 관리자 지급만 허용합니다.",
  event_only: "목록과 수동 코드 입력은 막고 이벤트 자동 지급/API 지급만 허용합니다.",
};

export function normalizeStepMissionType(value: unknown): StepMissionType {
  const normalized = String(value ?? "OTHER").toUpperCase();
  return STEP_MISSION_TYPES.includes(normalized as StepMissionType) ? (normalized as StepMissionType) : "OTHER";
}

export function normalizeStepRewardType(value: unknown): StepRewardType {
  const normalized = String(value ?? "OTHER").toUpperCase();
  return STEP_REWARD_TYPES.includes(normalized as StepRewardType) ? (normalized as StepRewardType) : "OTHER";
}

export function normalizeCouponVisibility(value: unknown): CouponVisibility {
  const normalized = String(value ?? "public").toLowerCase();
  if (["public", "hidden", "admin_only", "event_only"].includes(normalized)) return normalized as CouponVisibility;
  return "public";
}

export function describeStepReward(reward: StepRewardItem, lookup?: Partial<Record<"currency" | "draw" | "reward" | "box" | "coupon", string>>) {
  const amount = Math.max(1, Number(reward.amount ?? 1) || 1);
  const label = typeof reward.label === "string" && reward.label.trim() ? ` · ${reward.label.trim()}` : "";
  if (reward.type === "CURRENCY") return `${lookup?.currency ?? "포인트/화폐"} ${amount.toLocaleString()}${label}`;
  if (reward.type === "TICKET") return `${lookup?.draw ?? "뽑기"} 뽑기권 ${amount.toLocaleString()}장${label}`;
  if (reward.type === "RANDOM_BOX") return `${lookup?.box ?? "랜덤박스"} ${amount.toLocaleString()}개${label}`;
  if (reward.type === "ITEM") return `${lookup?.reward ?? "아이템"} ${amount.toLocaleString()}개${label}`;
  if (reward.type === "COUPON") return `${lookup?.coupon ?? "쿠폰"} ${amount.toLocaleString()}개${label}`;
  if (reward.type === "VIP") return `VIP ${Math.max(1, Number(reward.days ?? amount) || amount).toLocaleString()}일${label}`;
  if (reward.type === "EXP") return `${amount.toLocaleString()} EXP${label}`;
  return `${STEP_REWARD_LABELS[reward.type] ?? "보상"} ${amount.toLocaleString()}${label}`;
}

export function safeRewardArray(value: unknown): StepRewardItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): StepRewardItem | null => {
      if (!row || typeof row !== "object") return null;
      const source = row as Record<string, unknown>;
      const type = normalizeStepRewardType(source.type ?? source.reward_type);
      const amount = Math.max(1, Math.floor(Number(source.amount ?? 1) || 1));
      return {
        type,
        amount,
        currencyId: typeof source.currencyId === "string" ? source.currencyId : typeof source.currency_id === "string" ? source.currency_id : null,
        drawId: typeof source.drawId === "string" ? source.drawId : typeof source.draw_id === "string" ? source.draw_id : null,
        rewardId: typeof source.rewardId === "string" ? source.rewardId : typeof source.reward_id === "string" ? source.reward_id : null,
        boxId: typeof source.boxId === "string" ? source.boxId : typeof source.random_box_id === "string" ? source.random_box_id : null,
        couponId: typeof source.couponId === "string" ? source.couponId : typeof source.coupon_id === "string" ? source.coupon_id : null,
        label: typeof source.label === "string" ? source.label : null,
        days: Number.isFinite(Number(source.days)) ? Number(source.days) : null,
        meta: source.meta && typeof source.meta === "object" ? (source.meta as Record<string, unknown>) : null,
      };
    })
    .filter((row): row is StepRewardItem => Boolean(row));
}
