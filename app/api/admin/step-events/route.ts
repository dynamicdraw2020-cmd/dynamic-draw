import { z } from "zod";
import { enforceSameOrigin, fail, ok, readJsonWithLimit, rejectDemoMutation, requestMeta, requireApiAdmin, withApiRoute } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackStepMission } from "@/lib/step-events";
import { STEP_EVENT_REPEAT_TYPES, STEP_EVENT_STATUSES, STEP_MISSION_TYPES, safeRewardArray } from "@/lib/step-event-config";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

const baseBodySchema = z.object({ action: z.string().trim().min(1) }).passthrough();
const uuidSchema = z.string().uuid();

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeDateInput(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function assertPrimaryRewardReady(reward: ReturnType<typeof safeRewardArray>[number] | undefined) {
  if (!reward) return;
  if (reward.type === "CURRENCY" && !reward.currencyId) throw Object.assign(new Error("포인트/화폐 보상은 지급할 화폐를 선택해야 합니다."), { status: 422, code: "REWARD_TARGET_REQUIRED" });
  if (reward.type === "TICKET" && !reward.drawId) throw Object.assign(new Error("뽑기권 보상은 지급할 뽑기를 선택해야 합니다."), { status: 422, code: "REWARD_TARGET_REQUIRED" });
  if (reward.type === "ITEM" && !reward.rewardId) throw Object.assign(new Error("아이템/상품 보상은 지급할 상품을 선택해야 합니다."), { status: 422, code: "REWARD_TARGET_REQUIRED" });
  if (reward.type === "RANDOM_BOX" && !reward.boxId) throw Object.assign(new Error("랜덤박스 보상은 지급할 랜덤박스를 선택해야 합니다."), { status: 422, code: "REWARD_TARGET_REQUIRED" });
  if (reward.type === "COUPON" && !reward.couponId) throw Object.assign(new Error("쿠폰 보상은 지급할 쿠폰을 선택해야 합니다."), { status: 422, code: "REWARD_TARGET_REQUIRED" });
}

function parseRewards(body: Record<string, unknown>) {
  const primary = {
    type: body.rewardType,
    amount: Number(body.rewardAmount ?? 1),
    currencyId: nullableText(body.currencyId),
    drawId: nullableText(body.drawId),
    rewardId: nullableText(body.rewardId),
    boxId: nullableText(body.boxId),
    couponId: nullableText(body.couponId),
    label: nullableText(body.rewardLabel),
    days: Number(body.rewardDays ?? body.rewardAmount ?? 1),
  };

  const rewards = safeRewardArray([primary]);
  assertPrimaryRewardReady(rewards[0]);
  const extraText = String(body.extraRewardsJson ?? "").trim();
  if (!extraText) return rewards;

  try {
    const extra = JSON.parse(extraText);
    return [...rewards, ...safeRewardArray(extra)];
  } catch {
    throw Object.assign(new Error("추가 보상 JSON 형식을 확인해 주세요."), { status: 422, code: "INVALID_REWARD_JSON" });
  }
}

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiAdmin("MANAGER");
  if ("error" in guard) return guard.error;

  const parsed = baseBodySchema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());

  const body = parsed.data as Record<string, unknown> & { action: string };
  const admin = createAdminClient();
  const meta = requestMeta(request);
  const now = new Date().toISOString();

  if (body.action === "quick-create") {
    const schema = z.object({
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().max(2000).optional().default(""),
      stepTitle: z.string().trim().min(1).max(120),
      stepDescription: z.string().trim().max(2000).optional().default(""),
      startAt: z.string().optional().nullable(),
      endAt: z.string().optional().nullable(),
      status: z.enum(STEP_EVENT_STATUSES).default("DRAFT"),
      repeatType: z.enum(STEP_EVENT_REPEAT_TYPES).default("ONCE"),
      missionType: z.enum(STEP_MISSION_TYPES),
      targetValue: z.number().int().min(1).max(1_000_000),
      autoReward: z.boolean().optional().default(false),
      participationLimit: z.number().int().min(1).max(999).optional().default(1),
    }).passthrough();
    const input = schema.parse(body);
    const rewards = parseRewards(body);

    const { data: eventRow, error: eventError } = await admin
      .from("step_events")
      .insert({
        title: input.title,
        description: input.description || null,
        start_at: normalizeDateInput(input.startAt),
        end_at: normalizeDateInput(input.endAt),
        status: input.status,
        repeat_type: input.repeatType,
        auto_reward: input.autoReward,
        participation_limit: input.participationLimit,
        created_by: guard.auth.userId,
        updated_by: guard.auth.userId,
      })
      .select("*")
      .single();
    if (eventError || !eventRow) return fail("스탭업 이벤트를 만들지 못했습니다.", 400, "STEP_EVENT_CREATE_FAILED", eventError?.message);

    const eventId = String((eventRow as { id: string }).id);
    const { data: stepRow, error: stepError } = await admin
      .from("step_event_steps")
      .insert({
        event_id: eventId,
        step_no: 1,
        title: input.stepTitle,
        description: input.stepDescription || null,
        mission_type: input.missionType,
        target_value: input.targetValue,
        rewards,
        sort_order: 10,
        is_active: true,
        created_by: guard.auth.userId,
        updated_by: guard.auth.userId,
      })
      .select("*")
      .single();

    if (stepError) {
      await admin.from("step_events").update({ status: "ARCHIVED", updated_at: now }).eq("id", eventId);
      return fail("이벤트는 생성됐지만 STEP 생성에 실패해서 보관 처리했습니다.", 400, "STEP_QUICK_CREATE_STEP_FAILED", stepError.message);
    }

    return ok({ event: eventRow, step: stepRow }, 201);
  }

  if (body.action === "create-event") {
    const schema = z.object({
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().max(2000).optional().default(""),
      imageUrl: z.string().trim().max(1000).optional().default(""),
      startAt: z.string().optional().nullable(),
      endAt: z.string().optional().nullable(),
      status: z.enum(STEP_EVENT_STATUSES).default("DRAFT"),
      repeatType: z.enum(STEP_EVENT_REPEAT_TYPES).default("ONCE"),
      autoReward: z.boolean().optional().default(false),
      participationLimit: z.number().int().min(1).max(999).optional().default(1),
    });
    const input = schema.parse(body);
    const { data, error } = await admin
      .from("step_events")
      .insert({
        title: input.title,
        description: input.description || null,
        image_url: input.imageUrl || null,
        start_at: normalizeDateInput(input.startAt),
        end_at: normalizeDateInput(input.endAt),
        status: input.status,
        repeat_type: input.repeatType,
        auto_reward: input.autoReward,
        participation_limit: input.participationLimit,
        created_by: guard.auth.userId,
        updated_by: guard.auth.userId,
      })
      .select("*")
      .single();
    if (error) return fail("스탭업 이벤트를 만들지 못했습니다.", 400, "STEP_EVENT_CREATE_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "update-event") {
    const schema = z.object({
      eventId: uuidSchema,
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().max(2000).optional().default(""),
      imageUrl: z.string().trim().max(1000).optional().default(""),
      startAt: z.string().optional().nullable(),
      endAt: z.string().optional().nullable(),
      status: z.enum(STEP_EVENT_STATUSES),
      repeatType: z.enum(STEP_EVENT_REPEAT_TYPES),
      autoReward: z.boolean().optional().default(false),
      participationLimit: z.number().int().min(1).max(999).optional().default(1),
    });
    const input = schema.parse(body);
    const { error } = await admin
      .from("step_events")
      .update({
        title: input.title,
        description: input.description || null,
        image_url: input.imageUrl || null,
        start_at: normalizeDateInput(input.startAt),
        end_at: normalizeDateInput(input.endAt),
        status: input.status,
        repeat_type: input.repeatType,
        auto_reward: input.autoReward,
        participation_limit: input.participationLimit,
        updated_by: guard.auth.userId,
        updated_at: now,
      })
      .eq("id", input.eventId);
    if (error) return fail("스탭업 이벤트를 수정하지 못했습니다.", 400, "STEP_EVENT_UPDATE_FAILED", error.message);
    return ok({ eventId: input.eventId });
  }

  if (body.action === "toggle-event") {
    const schema = z.object({ eventId: uuidSchema, status: z.enum(STEP_EVENT_STATUSES) });
    const input = schema.parse(body);
    const { error } = await admin.from("step_events").update({ status: input.status, updated_by: guard.auth.userId, updated_at: now }).eq("id", input.eventId);
    if (error) return fail("이벤트 상태를 변경하지 못했습니다.", 400, "STEP_EVENT_TOGGLE_FAILED", error.message);
    return ok({ eventId: input.eventId, status: input.status });
  }

  if (body.action === "delete-event") {
    const schema = z.object({ eventId: uuidSchema });
    const input = schema.parse(body);
    const { error } = await admin.from("step_events").update({ status: "ARCHIVED", updated_by: guard.auth.userId, updated_at: now }).eq("id", input.eventId);
    if (error) return fail("스탭업 이벤트를 보관 처리하지 못했습니다.", 400, "STEP_EVENT_DELETE_FAILED", error.message);
    return ok({ eventId: input.eventId });
  }

  if (body.action === "create-step") {
    const schema = z.object({
      eventId: uuidSchema,
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(2000).optional().default(""),
      missionType: z.enum(STEP_MISSION_TYPES),
      targetValue: z.number().int().min(1).max(1_000_000),
      sortOrder: z.number().int().min(1).max(10000).optional().default(999),
    }).passthrough();
    const input = schema.parse(body);
    const rewards = parseRewards(body);
    const { count } = await admin.from("step_event_steps").select("id", { count: "exact", head: true }).eq("event_id", input.eventId);
    const stepNo = (count ?? 0) + 1;
    const { data, error } = await admin
      .from("step_event_steps")
      .insert({
        event_id: input.eventId,
        step_no: stepNo,
        title: input.title,
        description: input.description || null,
        mission_type: input.missionType,
        target_value: input.targetValue,
        rewards,
        sort_order: input.sortOrder === 999 ? stepNo * 10 : input.sortOrder,
        is_active: true,
        created_by: guard.auth.userId,
        updated_by: guard.auth.userId,
      })
      .select("*")
      .single();
    if (error) return fail("STEP을 추가하지 못했습니다.", 400, "STEP_CREATE_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "update-step") {
    const schema = z.object({
      stepId: uuidSchema,
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(2000).optional().default(""),
      missionType: z.enum(STEP_MISSION_TYPES),
      targetValue: z.number().int().min(1).max(1_000_000),
      sortOrder: z.number().int().min(1).max(10000),
      isActive: z.boolean().optional().default(true),
    }).passthrough();
    const input = schema.parse(body);
    const rewards = parseRewards(body);
    const { error } = await admin
      .from("step_event_steps")
      .update({
        title: input.title,
        description: input.description || null,
        mission_type: input.missionType,
        target_value: input.targetValue,
        rewards,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        updated_by: guard.auth.userId,
        updated_at: now,
      })
      .eq("id", input.stepId);
    if (error) return fail("STEP을 수정하지 못했습니다.", 400, "STEP_UPDATE_FAILED", error.message);
    return ok({ stepId: input.stepId });
  }

  if (body.action === "delete-step") {
    const schema = z.object({ stepId: uuidSchema });
    const input = schema.parse(body);
    const { error } = await admin.from("step_event_steps").update({ is_active: false, updated_by: guard.auth.userId, updated_at: now }).eq("id", input.stepId);
    if (error) return fail("STEP을 삭제하지 못했습니다.", 400, "STEP_DELETE_FAILED", error.message);
    return ok({ stepId: input.stepId });
  }

  if (body.action === "copy-step") {
    const schema = z.object({ stepId: uuidSchema });
    const input = schema.parse(body);
    const { data: source, error: sourceError } = await admin.from("step_event_steps").select("*").eq("id", input.stepId).maybeSingle();
    if (sourceError || !source) return fail("복사할 STEP을 찾을 수 없습니다.", 404, "STEP_NOT_FOUND", sourceError?.message);
    const row = source as Record<string, unknown>;
    const { count } = await admin.from("step_event_steps").select("id", { count: "exact", head: true }).eq("event_id", row.event_id);
    const next = (count ?? 0) + 1;
    const { data, error } = await admin
      .from("step_event_steps")
      .insert({
        event_id: row.event_id,
        step_no: next,
        title: `${String(row.title ?? "STEP")} 복사본`,
        description: row.description ?? null,
        mission_type: row.mission_type ?? "OTHER",
        target_value: row.target_value ?? 1,
        rewards: row.rewards ?? [],
        sort_order: next * 10,
        is_active: true,
        created_by: guard.auth.userId,
        updated_by: guard.auth.userId,
      })
      .select("*")
      .single();
    if (error) return fail("STEP을 복사하지 못했습니다.", 400, "STEP_COPY_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "move-step") {
    const schema = z.object({ eventId: uuidSchema, stepId: uuidSchema, direction: z.enum(["up", "down"]) });
    const input = schema.parse(body);
    const { data: steps, error } = await admin.from("step_event_steps").select("id,sort_order").eq("event_id", input.eventId).eq("is_active", true).order("sort_order", { ascending: true });
    if (error || !steps) return fail("STEP 순서를 불러오지 못했습니다.", 400, "STEP_ORDER_LOAD_FAILED", error?.message);
    const rows = steps as Array<{ id: string; sort_order: number }>;
    const index = rows.findIndex((step) => step.id === input.stepId);
    const other = input.direction === "up" ? rows[index - 1] : rows[index + 1];
    const current = rows[index];
    if (!current || !other) return ok({ moved: false });
    await Promise.allSettled([
      admin.from("step_event_steps").update({ sort_order: other.sort_order, updated_by: guard.auth.userId, updated_at: now }).eq("id", current.id),
      admin.from("step_event_steps").update({ sort_order: current.sort_order, updated_by: guard.auth.userId, updated_at: now }).eq("id", other.id),
    ]);
    return ok({ moved: true });
  }

  if (body.action === "admin-progress") {
    const schema = z.object({
      profileId: uuidSchema,
      missionType: z.enum(STEP_MISSION_TYPES).default("ADMIN_GRANT"),
      amount: z.number().int().min(1).max(1_000_000).default(1),
      memo: z.string().trim().max(500).optional().default("관리자 수동 진행"),
    });
    const input = schema.parse(body);
    const tracked = await trackStepMission({
      admin,
      profileId: input.profileId,
      missionType: input.missionType,
      amount: input.amount,
      sourceType: "ADMIN_STEP_PROGRESS",
      sourceId: guard.auth.userId,
      actorId: guard.auth.userId,
      autoClaim: true,
      details: { memo: input.memo, ip: meta.ip, userAgent: meta.userAgent },
    });
    return ok(tracked, 201);
  }

  return fail("지원하지 않는 스탭업 이벤트 작업입니다.", 404, "UNKNOWN_STEP_EVENT_ACTION");
}

export const POST = withApiRoute(postHandler, {
  routeName: "/api/admin/step-events",
  rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 },
});
