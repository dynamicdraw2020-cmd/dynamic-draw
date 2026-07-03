import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification, deliverRewards, type RewardItem } from "@/lib/reward-engine";
import { RUNTIME_LIMITS, withTimeout } from "@/lib/ops/runtime";
import { runtimeLog } from "@/lib/ops/logger";
import {
  type AdminStepEvent,
  type StepEventAdminData,
  type StepEventRepeatType,
  type StepEventRow,
  type StepEventStepRow,
  type StepMissionType,
  type StepRewardItem,
  type UserStepEvent,
  normalizeStepMissionType,
  safeRewardArray,
} from "@/lib/step-event-config";

type AdminClient = ReturnType<typeof createAdminClient>;

type ProgressRow = {
  event_id: string;
  step_id: string;
  profile_id: string;
  period_key: string;
  current_value: number;
  status: string;
  completed_at: string | null;
  claimed_at: string | null;
};

type RewardLogRow = {
  id: string;
  event_id: string;
  step_id: string;
  profile_id: string;
  status: string;
  rewards: unknown;
  delivered_rewards: unknown;
  created_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function isActiveWindow(event: Pick<StepEventRow, "status" | "start_at" | "end_at">) {
  if (event.status !== "ACTIVE") return false;
  const now = Date.now();
  if (event.start_at && new Date(event.start_at).getTime() > now) return false;
  if (event.end_at && new Date(event.end_at).getTime() < now) return false;
  return true;
}

export function stepPeriodKey(event: Pick<StepEventRow, "id" | "repeat_type">, at = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  if (event.repeat_type === "DAILY") return `daily:${date}`;
  if (event.repeat_type === "WEEKLY") {
    const parsed = new Date(`${date}T00:00:00+09:00`);
    const day = parsed.getUTCDay() || 7;
    parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((parsed.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `weekly:${parsed.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  if (event.repeat_type === "SEASON") return `season:${event.id}`;
  return `once:${event.id}`;
}

function sortSteps(steps: StepEventStepRow[]) {
  return [...steps].sort((a, b) => a.sort_order - b.sort_order || a.step_no - b.step_no || a.created_at.localeCompare(b.created_at));
}

function normalizeEvent(row: Record<string, unknown>): StepEventRow {
  return {
    id: String(row.id),
    title: String(row.title ?? "스탭업 이벤트"),
    description: typeof row.description === "string" ? row.description : null,
    image_url: typeof row.image_url === "string" ? row.image_url : null,
    start_at: typeof row.start_at === "string" ? row.start_at : null,
    end_at: typeof row.end_at === "string" ? row.end_at : null,
    status: String(row.status ?? "DRAFT") as StepEventRow["status"],
    repeat_type: String(row.repeat_type ?? "ONCE") as StepEventRepeatType,
    auto_reward: Boolean(row.auto_reward),
    participation_limit: Math.max(1, Number(row.participation_limit ?? 1) || 1),
    created_at: String(row.created_at ?? nowIso()),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function normalizeStep(row: Record<string, unknown>): StepEventStepRow {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    step_no: Math.max(1, Number(row.step_no ?? row.sort_order ?? 1) || 1),
    title: String(row.title ?? "STEP"),
    description: typeof row.description === "string" ? row.description : null,
    mission_type: normalizeStepMissionType(row.mission_type),
    target_value: Math.max(1, Number(row.target_value ?? 1) || 1),
    rewards: safeRewardArray(row.rewards),
    sort_order: Math.max(1, Number(row.sort_order ?? row.step_no ?? 1) || 1),
    is_active: row.is_active !== false,
    created_at: String(row.created_at ?? nowIso()),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function progressKey(eventId: string, stepId: string, periodKey: string) {
  return `${eventId}:${stepId}:${periodKey}`;
}

export async function getUserStepEvents(profileId: string): Promise<UserStepEvent[]> {
  const admin = createAdminClient();
  try {
    const eventsResult = await withTimeout(
      admin.from("step_events").select("id,title,description,image_url,start_at,end_at,status,repeat_type,auto_reward,participation_limit,created_at,updated_at").in("status", ["ACTIVE", "PAUSED"]).order("created_at", { ascending: false }),
      RUNTIME_LIMITS.readQueryTimeoutMs,
      "user step events",
    );

    const events = ((eventsResult.data ?? []) as Array<Record<string, unknown>>).map(normalizeEvent).filter(isActiveWindow);
    const eventIds = events.map((event) => event.id);
    if (!eventIds.length) return [];

    const [stepsResult, progressResult] = await Promise.allSettled([
      withTimeout(
        admin.from("step_event_steps").select("id,event_id,step_no,title,description,mission_type,target_value,rewards,sort_order,is_active,created_at,updated_at").in("event_id", eventIds).eq("is_active", true).order("sort_order", { ascending: true }),
        RUNTIME_LIMITS.readQueryTimeoutMs,
        "user step event steps",
      ),
      withTimeout(
        admin.from("step_event_progress").select("event_id,step_id,profile_id,period_key,current_value,status,completed_at,claimed_at").eq("profile_id", profileId).in("event_id", eventIds),
        RUNTIME_LIMITS.readQueryTimeoutMs,
        "user step event progress",
      ),
    ]);

    const steps = stepsResult.status === "fulfilled" ? ((stepsResult.value.data ?? []) as Array<Record<string, unknown>>).map(normalizeStep) : [];
    const progressRows = progressResult.status === "fulfilled" ? ((progressResult.value.data ?? []) as ProgressRow[]) : [];
    const progressMap = new Map(progressRows.map((row) => [progressKey(row.event_id, row.step_id, row.period_key), row]));

    return events.map((event) => {
      const periodKey = stepPeriodKey(event);
      const eventSteps = sortSteps(steps.filter((step) => step.event_id === event.id));
      let previousClaimed = true;
      const userSteps = eventSteps.map((step) => {
        const row = progressMap.get(progressKey(event.id, step.id, periodKey));
        const currentValue = Math.max(0, Number(row?.current_value ?? 0) || 0);
        const completed = Boolean(row?.completed_at) || currentValue >= step.target_value;
        const claimed = Boolean(row?.claimed_at) || row?.status === "CLAIMED";
        const locked = !previousClaimed;
        if (!claimed) previousClaimed = false;
        const percent = Math.min(100, Math.floor((currentValue / Math.max(1, step.target_value)) * 100));
        return {
          ...step,
          current_value: currentValue,
          progress_percent: percent,
          period_key: periodKey,
          locked,
          completed,
          claimed,
          completed_at: row?.completed_at ?? (completed ? null : null),
          claimed_at: row?.claimed_at ?? null,
        };
      });

      return {
        ...event,
        steps: userSteps,
        participant_status: userSteps.every((step) => step.claimed) && userSteps.length ? "COMPLETED" : userSteps.some((step) => step.current_value > 0 || step.completed || step.claimed) ? "IN_PROGRESS" : null,
        completed_count: userSteps.filter((step) => step.claimed).length,
        total_steps: userSteps.length,
      };
    });
  } catch (error) {
    runtimeLog({ level: "WARN", event: "USER_STEP_EVENTS_FALLBACK_EMPTY", error });
    return [];
  }
}

async function getResources(admin: AdminClient): Promise<StepEventAdminData["resources"]> {
  const [currencies, draws, rewards, boxes, coupons] = await Promise.allSettled([
    withTimeout(admin.from("virtual_currencies").select("id,name,code,symbol,is_active,deleted_at").eq("is_active", true).order("sort_order", { ascending: true }).limit(300), RUNTIME_LIMITS.readQueryTimeoutMs, "step resources currencies"),
    withTimeout(admin.from("draws").select("id,name,status,deleted_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(300), RUNTIME_LIMITS.readQueryTimeoutMs, "step resources draws"),
    withTimeout(admin.from("rewards").select("id,name,deleted_at,is_active").eq("is_active", true).is("deleted_at", null).order("sort_order", { ascending: true }).limit(500), RUNTIME_LIMITS.readQueryTimeoutMs, "step resources rewards"),
    withTimeout(admin.from("random_boxes").select("id,name,is_active,deleted_at").eq("is_active", true).is("deleted_at", null).order("sort_order", { ascending: true }).limit(300), RUNTIME_LIMITS.readQueryTimeoutMs, "step resources boxes"),
    withTimeout(admin.from("promo_codes").select("id,name,code,is_active,deleted_at,visibility").eq("is_active", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(500), RUNTIME_LIMITS.readQueryTimeoutMs, "step resources coupons"),
  ]);

  const rows = <T extends Record<string, unknown>>(result: PromiseSettledResult<{ data: T[] | null }>) => (result.status === "fulfilled" ? result.value.data ?? [] : []);

  return {
    currencies: rows(currencies).map((row) => ({ id: String(row.id), name: String(row.name ?? row.code ?? "화폐"), code: typeof row.code === "string" ? row.code : null, symbol: typeof row.symbol === "string" ? row.symbol : null })),
    draws: rows(draws).map((row) => ({ id: String(row.id), name: String(row.name ?? "뽑기"), status: typeof row.status === "string" ? row.status : null })),
    rewards: rows(rewards).map((row) => ({ id: String(row.id), name: String(row.name ?? "상품") })),
    boxes: rows(boxes).map((row) => ({ id: String(row.id), name: String(row.name ?? "랜덤박스") })),
    coupons: rows(coupons).map((row) => ({ id: String(row.id), name: `${String(row.code ?? "COUPON")} · ${String(row.name ?? "쿠폰")}`, code: typeof row.code === "string" ? row.code : null })),
  };
}

export async function getAdminStepEventData(): Promise<StepEventAdminData> {
  const admin = createAdminClient();
  const fallback: StepEventAdminData = { events: [], resources: { currencies: [], draws: [], rewards: [], boxes: [], coupons: [] } };
  try {
    const [eventsResult, stepsResult, progressResult, rewardsResult, resources] = await Promise.allSettled([
      withTimeout(admin.from("step_events").select("id,title,description,image_url,start_at,end_at,status,repeat_type,auto_reward,participation_limit,created_at,updated_at").order("created_at", { ascending: false }).limit(200), RUNTIME_LIMITS.readQueryTimeoutMs, "admin step events"),
      withTimeout(admin.from("step_event_steps").select("id,event_id,step_no,title,description,mission_type,target_value,rewards,sort_order,is_active,created_at,updated_at").order("sort_order", { ascending: true }).limit(2000), RUNTIME_LIMITS.readQueryTimeoutMs, "admin step steps"),
      withTimeout(admin.from("step_event_progress").select("event_id,step_id,profile_id,current_value,status,completed_at,claimed_at").limit(10000), RUNTIME_LIMITS.readQueryTimeoutMs, "admin step progress"),
      withTimeout(admin.from("step_event_reward_logs").select("id,event_id,step_id,profile_id,status,rewards,delivered_rewards,created_at").order("created_at", { ascending: false }).limit(1000), RUNTIME_LIMITS.readQueryTimeoutMs, "admin step rewards"),
      getResources(admin),
    ]);

    const events = eventsResult.status === "fulfilled" ? ((eventsResult.value.data ?? []) as Array<Record<string, unknown>>).map(normalizeEvent) : [];
    const steps = stepsResult.status === "fulfilled" ? ((stepsResult.value.data ?? []) as Array<Record<string, unknown>>).map(normalizeStep) : [];
    const progressRows = progressResult.status === "fulfilled" ? ((progressResult.value.data ?? []) as ProgressRow[]) : [];
    const rewardRows = rewardsResult.status === "fulfilled" ? ((rewardsResult.value.data ?? []) as RewardLogRow[]) : [];
    const resourceRows = resources.status === "fulfilled" ? resources.value : fallback.resources;

    const adminEvents: AdminStepEvent[] = events.map((event) => {
      const eventSteps = sortSteps(steps.filter((step) => step.event_id === event.id));
      const eventProgress = progressRows.filter((row) => row.event_id === event.id);
      const profiles = new Set(eventProgress.map((row) => row.profile_id));
      const completedProfiles = new Set(
        eventProgress
          .filter((row) => row.status === "CLAIMED" || Boolean(row.claimed_at))
          .map((row) => row.profile_id),
      );
      return {
        ...event,
        steps: eventSteps,
        stats: {
          participantCount: profiles.size,
          completedParticipantCount: completedProfiles.size,
          rewardLogCount: rewardRows.filter((row) => row.event_id === event.id).length,
          stepStats: eventSteps.map((step) => {
            const rows = eventProgress.filter((row) => row.step_id === step.id);
            return {
              stepId: step.id,
              completed: rows.filter((row) => row.status === "COMPLETED" || row.status === "CLAIMED" || Boolean(row.completed_at)).length,
              claimed: rows.filter((row) => row.status === "CLAIMED" || Boolean(row.claimed_at)).length,
            };
          }),
        },
      };
    });

    return { events: adminEvents, resources: resourceRows };
  } catch (error) {
    runtimeLog({ level: "WARN", event: "ADMIN_STEP_EVENTS_FALLBACK_EMPTY", error });
    return fallback;
  }
}

function toRewardItem(reward: StepRewardItem): RewardItem | null {
  const amount = Math.max(1, Math.floor(Number(reward.amount ?? 1) || 1));
  if (reward.type === "CURRENCY" && reward.currencyId) return { type: "CURRENCY", amount, currencyId: reward.currencyId, label: reward.label ?? undefined };
  if (reward.type === "TICKET" && reward.drawId) return { type: "TICKET", amount, drawId: reward.drawId, label: reward.label ?? undefined };
  if (reward.type === "ITEM" && reward.rewardId) return { type: "ITEM", amount, rewardId: reward.rewardId, label: reward.label ?? undefined };
  if (reward.type === "RANDOM_BOX" && reward.boxId) return { type: "RANDOM_BOX", amount, boxId: reward.boxId, label: reward.label ?? undefined };
  if (reward.type === "EXP") return { type: "EXP", amount, label: reward.label ?? undefined };
  return null;
}

function isCouponReward(reward: StepRewardItem) {
  return reward.type === "COUPON" && Boolean(reward.couponId);
}

async function deliverCouponRewards(admin: AdminClient, profileId: string, eventTitle: string, stepTitle: string, rewards: StepRewardItem[]) {
  const couponRewards = rewards.filter(isCouponReward);
  if (!couponRewards.length) return [];

  const delivered: Array<Record<string, unknown>> = [];
  for (const reward of couponRewards) {
    try {
      const couponId = String(reward.couponId);
      const amount = Math.max(1, Math.floor(Number(reward.amount ?? 1) || 1));
      const { data: coupon } = await withTimeout(
        admin.from("promo_codes").select("id,code,name,visibility,is_active,deleted_at").eq("id", couponId).maybeSingle(),
        RUNTIME_LIMITS.readQueryTimeoutMs,
        "step coupon reward lookup",
      );
      const row = coupon as { id?: string; code?: string; name?: string; visibility?: string | null; is_active?: boolean; deleted_at?: string | null } | null;
      if (!row?.id || row.is_active === false || row.deleted_at) continue;

      await createNotification(
        admin,
        profileId,
        `${eventTitle} 쿠폰 보상`,
        `${stepTitle} 보상 쿠폰이 지급되었습니다. 코드: ${row.code ?? "쿠폰센터 확인"}`,
        "STEP_EVENT_COUPON",
        "/rewards",
      );

      delivered.push({
        type: "COUPON",
        couponId: row.id,
        code: row.code ?? null,
        name: row.name ?? "쿠폰",
        visibility: row.visibility ?? "hidden",
        amount,
        delivery: "notification_code",
      });
    } catch (error) {
      runtimeLog({ level: "WARN", event: "STEP_COUPON_REWARD_FALLBACK", error, details: { profileId, stepTitle } });
    }
  }
  return delivered;
}

function nextStep(steps: StepEventStepRow[], currentStepId: string) {
  const sorted = sortSteps(steps);
  const index = sorted.findIndex((step) => step.id === currentStepId);
  return index >= 0 ? sorted[index + 1] ?? null : null;
}

export async function claimStepEventReward(options: {
  admin?: AdminClient;
  profileId: string;
  eventId: string;
  stepId: string;
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const admin = options.admin ?? createAdminClient();
  const [eventResult, stepResult, allStepsResult] = await Promise.allSettled([
    admin.from("step_events").select("id,title,status,repeat_type,auto_reward,start_at,end_at").eq("id", options.eventId).maybeSingle(),
    admin.from("step_event_steps").select("id,event_id,step_no,title,mission_type,target_value,rewards,sort_order,is_active,created_at").eq("id", options.stepId).eq("event_id", options.eventId).maybeSingle(),
    admin.from("step_event_steps").select("id,event_id,step_no,title,description,mission_type,target_value,rewards,sort_order,is_active,created_at,updated_at").eq("event_id", options.eventId).eq("is_active", true).order("sort_order", { ascending: true }),
  ]);

  const event = eventResult.status === "fulfilled" && eventResult.value.data ? normalizeEvent(eventResult.value.data as Record<string, unknown>) : null;
  const step = stepResult.status === "fulfilled" && stepResult.value.data ? normalizeStep(stepResult.value.data as Record<string, unknown>) : null;
  const steps = allStepsResult.status === "fulfilled" ? ((allStepsResult.value.data ?? []) as Array<Record<string, unknown>>).map(normalizeStep) : [];
  if (!event || !isActiveWindow(event)) throw Object.assign(new Error("진행 중인 스탭업 이벤트가 아닙니다."), { status: 409, code: "STEP_EVENT_NOT_ACTIVE" });
  if (!step || !step.is_active) throw Object.assign(new Error("STEP을 찾을 수 없습니다."), { status: 404, code: "STEP_NOT_FOUND" });

  const periodKey = stepPeriodKey(event);
  const { data: progress } = await admin
    .from("step_event_progress")
    .select("event_id,step_id,profile_id,period_key,current_value,status,completed_at,claimed_at")
    .eq("event_id", options.eventId)
    .eq("step_id", options.stepId)
    .eq("profile_id", options.profileId)
    .eq("period_key", periodKey)
    .maybeSingle();

  const current = progress as ProgressRow | null;
  const currentValue = Math.max(0, Number(current?.current_value ?? 0) || 0);
  if (!current || currentValue < step.target_value) throw Object.assign(new Error("아직 STEP 목표를 완료하지 못했습니다."), { status: 409, code: "STEP_NOT_COMPLETED" });
  if (current.status === "CLAIMED" || current.claimed_at) throw Object.assign(new Error("이미 보상을 받은 STEP입니다."), { status: 409, code: "STEP_ALREADY_CLAIMED" });

  const previousSteps = sortSteps(steps).filter((candidate) => candidate.sort_order < step.sort_order);
  if (previousSteps.length) {
    const previousIds = previousSteps.map((candidate) => candidate.id);
    const { data: previousProgress } = await admin
      .from("step_event_progress")
      .select("step_id,status,claimed_at")
      .eq("event_id", options.eventId)
      .eq("profile_id", options.profileId)
      .eq("period_key", periodKey)
      .in("step_id", previousIds);
    const claimed = new Set(((previousProgress ?? []) as Array<{ step_id: string; status?: string | null; claimed_at?: string | null }>).filter((row) => row.status === "CLAIMED" || row.claimed_at).map((row) => row.step_id));
    if (previousIds.some((stepId) => !claimed.has(stepId))) throw Object.assign(new Error("이전 STEP 보상을 먼저 받아야 합니다."), { status: 409, code: "PREVIOUS_STEP_REQUIRED" });
  }

  const deliverable = step.rewards.map(toRewardItem).filter((row): row is RewardItem => Boolean(row));
  const couponRewards = step.rewards.filter(isCouponReward);
  const unsupported = step.rewards.filter((row) => !toRewardItem(row) && !isCouponReward(row));
  const deliveredByEngine = deliverable.length
    ? await deliverRewards({
        admin,
        profileId: options.profileId,
        rewards: deliverable,
        sourceType: "STEP_EVENT",
        sourceId: step.id,
        createdBy: options.actorId ?? options.profileId,
        ip: options.ip ?? "system",
        userAgent: options.userAgent ?? "system",
        notifyTitle: `${event.title} 보상 지급`,
        notifyBody: `${step.title} 완료 보상이 지급되었습니다.`,
      })
    : [];
  const deliveredCoupons = await deliverCouponRewards(admin, options.profileId, event.title, step.title, couponRewards);
  const delivered = [...deliveredByEngine, ...deliveredCoupons];

  if (unsupported.length) {
    await createNotification(
      admin,
      options.profileId,
      `${event.title} 수동 보상 확인 필요`,
      `${step.title} 보상 중 관리자 확인이 필요한 항목이 있습니다.`,
      "STEP_EVENT",
      "/step-events",
    );
  }

  await admin.from("step_event_reward_logs").insert({
    event_id: options.eventId,
    step_id: options.stepId,
    profile_id: options.profileId,
    rewards: step.rewards,
    delivered_rewards: delivered,
    status: unsupported.length ? "PARTIAL" : "DELIVERED",
    error_message: unsupported.length ? "manual reward item exists" : null,
    created_by: options.actorId ?? options.profileId,
  });

  await admin
    .from("step_event_progress")
    .update({ status: "CLAIMED", claimed_at: nowIso(), updated_at: nowIso() })
    .eq("event_id", options.eventId)
    .eq("step_id", options.stepId)
    .eq("profile_id", options.profileId)
    .eq("period_key", periodKey);

  const next = nextStep(steps, options.stepId);
  if (next) {
    await admin.from("step_event_progress").upsert(
      {
        event_id: options.eventId,
        step_id: next.id,
        profile_id: options.profileId,
        period_key: periodKey,
        current_value: 0,
        status: "OPEN",
        updated_at: nowIso(),
      },
      { onConflict: "event_id,step_id,profile_id,period_key" },
    );
  } else {
    await admin.from("step_event_participants").upsert(
      {
        event_id: options.eventId,
        profile_id: options.profileId,
        period_key: periodKey,
        status: "COMPLETED",
        completed_at: nowIso(),
        updated_at: nowIso(),
      },
      { onConflict: "event_id,profile_id,period_key" },
    );
  }

  return { delivered, manualRewards: unsupported, nextStepId: next?.id ?? null };
}

async function autoClaimCompletedSteps(admin: AdminClient, profileId: string, touched: Array<{ eventId: string; stepId: string }>, actorId?: string | null) {
  const results = [];
  for (const row of touched) {
    try {
      results.push(await claimStepEventReward({ admin, profileId, eventId: row.eventId, stepId: row.stepId, actorId: actorId ?? profileId, ip: "system", userAgent: "step-event-auto" }));
    } catch {
      // 아직 완료 전이거나 이미 수령한 STEP은 조용히 무시합니다.
    }
  }
  return results;
}

export async function trackStepMission(options: {
  admin?: AdminClient;
  profileId: string;
  missionType: StepMissionType | string;
  amount?: number;
  sourceType: string;
  sourceId?: string | null;
  details?: Record<string, unknown>;
  autoClaim?: boolean;
  actorId?: string | null;
}) {
  const admin = options.admin ?? createAdminClient();
  const missionType = normalizeStepMissionType(options.missionType);
  const amount = Math.max(1, Math.floor(Number(options.amount ?? 1) || 1));

  try {
    const result = await withTimeout(
      admin.rpc("record_step_event_progress", {
        p_profile_id: options.profileId,
        p_mission_type: missionType,
        p_amount: amount,
        p_source_type: options.sourceType,
        p_source_id: options.sourceId ?? null,
        p_details: options.details ?? {},
      }),
      Math.min(1200, RUNTIME_LIMITS.readQueryTimeoutMs),
      "track step mission",
    );

    const rows = Array.isArray(result.data) ? result.data : Array.isArray((result.data as { updated?: unknown })?.updated) ? ((result.data as { updated: unknown[] }).updated) : [];
    const touched = rows
      .map((item) => item as Record<string, unknown>)
      .map((item) => ({ eventId: String(item.event_id ?? item.eventId ?? ""), stepId: String(item.step_id ?? item.stepId ?? ""), autoReward: Boolean(item.auto_reward ?? item.autoReward) }))
      .filter((item) => item.eventId && item.stepId);

    if (options.autoClaim) {
      const autoTargets = touched.filter((item) => item.autoReward).map((item) => ({ eventId: item.eventId, stepId: item.stepId }));
      if (autoTargets.length) await autoClaimCompletedSteps(admin, options.profileId, autoTargets, options.actorId ?? options.profileId);
    }

    return { updated: touched };
  } catch (error) {
    runtimeLog({ level: "WARN", event: "STEP_MISSION_TRACK_FALLBACK", error, details: { missionType, profileId: options.profileId } });
    return { updated: [] };
  }
}

export function trackStepMissionSoon(options: Parameters<typeof trackStepMission>[0]) {
  void trackStepMission(options).catch((error) => runtimeLog({ level: "WARN", event: "STEP_MISSION_TRACK_ASYNC_FAILED", error }));
}
