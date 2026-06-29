import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverRewards, type RewardItem } from "@/lib/reward-engine";

const rewardItemSchema = z.object({
  type: z.enum(["CURRENCY", "TICKET", "ITEM", "RANDOM_BOX", "EXP"]),
  amount: z.number().int().min(1).max(1_000_000).default(1),
  currencyId: z.uuid().optional().nullable(),
  drawId: z.uuid().optional().nullable(),
  rewardId: z.uuid().optional().nullable(),
  boxId: z.uuid().optional().nullable(),
  label: z.string().trim().max(80).optional().default(""),
});

function rewardFromBody(body: Record<string, unknown>) {
  return rewardItemSchema.parse({
    type: body.rewardType,
    amount: Number(body.rewardAmount ?? 1),
    currencyId: body.currencyId || undefined,
    drawId: body.drawId || undefined,
    rewardId: body.rewardId || undefined,
    boxId: body.rewardBoxId || body.boxRewardId || undefined,
    label: body.rewardLabel || undefined,
  });
}

const bodySchema = z.object({ action: z.string().trim().min(1) }).passthrough();


export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");

  const body = parsed.data as Record<string, unknown> & { action: string };
  const admin = createAdminClient();
  const meta = requestMeta(request);

  if (body.action === "create-box") {
    const schema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(500).optional().default(""), isSignupReward: z.boolean().optional().default(false) });
    const input = schema.parse(body);
    const { data, error } = await admin.from("random_boxes").insert({ name: input.name, description: input.description, is_signup_reward: input.isSignupReward, created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("랜덤박스를 만들지 못했습니다.", 400, "RANDOM_BOX_CREATE_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "toggle-box") {
    const schema = z.object({ boxId: z.uuid(), isActive: z.boolean() });
    const input = schema.parse(body);
    const { error } = await admin.from("random_boxes").update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq("id", input.boxId);
    if (error) return fail("랜덤박스 상태를 변경하지 못했습니다.", 400, "RANDOM_BOX_TOGGLE_FAILED", error.message);
    return ok({ boxId: input.boxId, isActive: input.isActive });
  }

  if (body.action === "delete-box") {
    const schema = z.object({ boxId: z.uuid() });
    const input = schema.parse(body);
    const { error } = await admin.from("random_boxes").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", input.boxId);
    if (error) return fail("랜덤박스를 삭제하지 못했습니다.", 400, "RANDOM_BOX_DELETE_FAILED", error.message);
    return ok({ boxId: input.boxId });
  }

  if (body.action === "add-box-reward") {
    const schema = z.object({ boxId: z.uuid(), probabilityPercent: z.number().min(0.001).max(100), sortOrder: z.number().int().optional().default(10) }).passthrough();
    const input = schema.parse(body);
    const reward = rewardFromBody(body);
    const probabilityUnits = Math.round(input.probabilityPercent * 10000);
    const { data, error } = await admin.from("random_box_rewards").insert({
      box_id: input.boxId,
      reward_type: reward.type,
      amount: reward.amount ?? 1,
      currency_id: reward.currencyId ?? null,
      draw_id: reward.drawId ?? null,
      reward_id: reward.rewardId ?? null,
      random_box_id: reward.boxId ?? null,
      label: reward.label ?? null,
      probability_units: probabilityUnits,
      sort_order: input.sortOrder,
      created_by: guard.auth.userId,
    }).select("*").single();
    if (error) return fail("랜덤박스 보상을 추가하지 못했습니다.", 400, "BOX_REWARD_CREATE_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "delete-box-reward") {
    const schema = z.object({ rewardRowId: z.uuid() });
    const input = schema.parse(body);
    const { error } = await admin.from("random_box_rewards").delete().eq("id", input.rewardRowId);
    if (error) return fail("랜덤박스 보상을 삭제하지 못했습니다.", 400, "BOX_REWARD_DELETE_FAILED", error.message);
    return ok({ rewardRowId: input.rewardRowId });
  }

  if (body.action === "save-settings") {
    const schema = z.object({ signupBoxId: z.string().optional().nullable(), referralReferrerBoxId: z.string().optional().nullable(), referralReferredBoxId: z.string().optional().nullable() });
    const input = schema.parse(body);
    const rows = [
      { key: "signup_reward_box_id", value: input.signupBoxId || null, is_public: false, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
      { key: "referral_referrer_box_id", value: input.referralReferrerBoxId || null, is_public: false, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
      { key: "referral_referred_box_id", value: input.referralReferredBoxId || null, is_public: false, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
    ];
    const { error } = await admin.from("site_settings").upsert(rows, { onConflict: "key" });
    if (error) return fail("보상 설정을 저장하지 못했습니다.", 400, "REWARD_SETTINGS_FAILED", error.message);
    return ok({ saved: true });
  }

  if (body.action === "create-attendance-rule") {
    const schema = z.object({ name: z.string().trim().min(2).max(80), ruleType: z.enum(["DAILY", "STREAK", "MONTHLY"]), requiredCount: z.number().int().min(1).max(366), sortOrder: z.number().int().optional().default(10) }).passthrough();
    const input = schema.parse(body);
    const reward = rewardFromBody(body);
    const { data, error } = await admin.from("attendance_reward_rules").insert({ name: input.name, rule_type: input.ruleType, required_count: input.requiredCount, rewards: [reward], sort_order: input.sortOrder, created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("출석 보상 규칙을 만들지 못했습니다.", 400, "ATTENDANCE_RULE_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "delete-attendance-rule") {
    const schema = z.object({ ruleId: z.uuid() });
    const input = schema.parse(body);
    const { error } = await admin.from("attendance_reward_rules").delete().eq("id", input.ruleId);
    if (error) return fail("출석 보상 규칙을 삭제하지 못했습니다.", 400, "ATTENDANCE_RULE_DELETE_FAILED", error.message);
    return ok({ ruleId: input.ruleId });
  }

  if (body.action === "force-attendance" || body.action === "cancel-attendance") {
    const schema = z.object({ profileId: z.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
    const input = schema.parse(body);
    if (body.action === "cancel-attendance") {
      const { error } = await admin.from("attendance_logs").delete().eq("profile_id", input.profileId).eq("attendance_date", input.date);
      if (error) return fail("출석을 취소하지 못했습니다.", 400, "ATTENDANCE_CANCEL_FAILED", error.message);
      return ok({ canceled: true });
    }
    const rewards = await getAttendanceRewards(admin, input.profileId, input.date);
    const { data, error } = await admin.from("attendance_logs").upsert({ profile_id: input.profileId, attendance_date: input.date, source: "ADMIN", checked_by: guard.auth.userId, streak_count: rewards.streak, reward_snapshot: rewards.items }, { onConflict: "profile_id,attendance_date" }).select("*").single();
    if (error) return fail("강제 출석을 처리하지 못했습니다.", 400, "ATTENDANCE_FORCE_FAILED", error.message);
    await deliverRewards({ admin, profileId: input.profileId, rewards: rewards.items as RewardItem[], sourceType: "ADMIN_ATTENDANCE", sourceId: data.id, createdBy: guard.auth.userId, ip: meta.ip, userAgent: meta.userAgent, notifyTitle: "출석 보상이 지급되었습니다", notifyBody: "관리자가 출석을 처리했습니다." });
    return ok(data, 201);
  }

  if (body.action === "create-promo-code") {
    const schema = z.object({
      code: z.string().trim().min(3).max(40),
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(400).optional().default(""),
      codeType: z.enum(["COUPON", "EVENT_CODE"]),
      targetMode: z.enum(["ALL", "PROFILE", "ROLE"]).default("ALL"),
      targetProfileId: z.string().optional().nullable(),
      targetRole: z.string().optional().nullable(),
      startsAt: z.string().optional().nullable(),
      endsAt: z.string().optional().nullable(),
      maxUses: z.number().int().min(1).optional().nullable(),
      perUserLimit: z.number().int().min(1).max(99).default(1),
    }).passthrough();
    const input = schema.parse(body);
    const reward = rewardFromBody(body);
    const { data, error } = await admin.from("promo_codes").insert({
      code: input.code.toUpperCase(), name: input.name, description: input.description, code_type: input.codeType,
      target_mode: input.targetMode, target_profile_id: input.targetMode === "PROFILE" ? input.targetProfileId || null : null,
      target_role: input.targetMode === "ROLE" ? input.targetRole || null : null,
      starts_at: input.startsAt || null, ends_at: input.endsAt || null, max_uses: input.maxUses ?? null, per_user_limit: input.perUserLimit,
      rewards: [reward], created_by: guard.auth.userId,
    }).select("*").single();
    if (error) return fail("쿠폰/이벤트 코드를 만들지 못했습니다.", 400, "PROMO_CREATE_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "toggle-promo-code") {
    const schema = z.object({ codeId: z.uuid(), isActive: z.boolean() });
    const input = schema.parse(body);
    const { error } = await admin.from("promo_codes").update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq("id", input.codeId);
    if (error) return fail("코드 상태를 변경하지 못했습니다.", 400, "PROMO_TOGGLE_FAILED", error.message);
    return ok({ codeId: input.codeId, isActive: input.isActive });
  }

  if (body.action === "delete-promo-code") {
    const schema = z.object({ codeId: z.uuid() });
    const input = schema.parse(body);
    const { error } = await admin.from("promo_codes").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", input.codeId);
    if (error) return fail("코드를 삭제하지 못했습니다.", 400, "PROMO_DELETE_FAILED", error.message);
    return ok({ codeId: input.codeId });
  }

  return fail("지원하지 않는 보상 관리 작업입니다.", 404, "UNKNOWN_REWARD_ACTION");
}

async function getAttendanceRewards(admin: ReturnType<typeof createAdminClient>, profileId: string, date: string) {
  const { data: logs } = await admin.from("attendance_logs").select("attendance_date").eq("profile_id", profileId).lt("attendance_date", date).order("attendance_date", { ascending: false }).limit(40);
  let streak = 1;
  let cursor = new Date(`${date}T00:00:00+09:00`);
  const existingDates = new Set(((logs ?? []) as Array<{ attendance_date: string }>).map((row) => row.attendance_date));
  for (;;) {
    cursor = new Date(cursor.getTime() - 86400000);
    const key = cursor.toISOString().slice(0, 10);
    if (existingDates.has(key)) streak += 1;
    else break;
  }
  const monthPrefix = date.slice(0, 7);
  const { count } = await admin.from("attendance_logs").select("id", { count: "exact", head: true }).eq("profile_id", profileId).gte("attendance_date", `${monthPrefix}-01`).lte("attendance_date", date);
  const monthCount = (count ?? 0) + 1;
  const { data: rules } = await admin.from("attendance_reward_rules").select("rewards,rule_type,required_count").eq("is_active", true);
  const items = ((rules ?? []) as Array<{ rewards: Array<Record<string, unknown>>; rule_type: string; required_count: number }>).flatMap((rule) => {
    if (rule.rule_type === "DAILY") return rule.rewards;
    if (rule.rule_type === "STREAK" && rule.required_count === streak) return rule.rewards;
    if (rule.rule_type === "MONTHLY" && rule.required_count === monthCount) return rule.rewards;
    return [];
  });
  return { streak, monthCount, items };
}
