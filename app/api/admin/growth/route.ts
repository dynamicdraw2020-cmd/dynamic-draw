import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ action: z.string().trim().min(1) }).passthrough();

function parseJsonArray(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("JSON은 배열 형식이어야 합니다.");
  return parsed;
}

async function syncLevel(admin: ReturnType<typeof createAdminClient>, profileId: string) {
  const { data: growth } = await admin.from("profile_growth").select("exp_total").eq("profile_id", profileId).maybeSingle();
  const expTotal = Number((growth as { exp_total?: number } | null)?.exp_total ?? 0);
  const { data: level } = await admin.from("level_rules").select("level_no").lte("required_exp", expTotal).eq("is_active", true).order("required_exp", { ascending: false }).limit(1).maybeSingle();
  const nextLevel = Number((level as { level_no?: number } | null)?.level_no ?? 1);
  const { data: vip } = await admin.from("vip_tiers").select("id").eq("is_active", true).lte("threshold_level", nextLevel).lte("threshold_exp", expTotal).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  await admin.from("profile_growth").upsert({ profile_id: profileId, exp_total: expTotal, level_no: nextLevel, vip_tier_id: (vip as { id?: string } | null)?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "profile_id" });
}

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const body = parsed.data as Record<string, unknown> & { action: string };
  const admin = createAdminClient();
  const meta = requestMeta(request);

  try {
    if (body.action === "save-level") {
      const input = z.object({ levelNo: z.coerce.number().int().min(1).max(999), name: z.string().trim().min(1).max(80), requiredExp: z.coerce.number().int().min(0), description: z.string().trim().max(300).optional().default(""), rewardsJson: z.string().optional().default("") }).parse(body);
      const rewards = parseJsonArray(input.rewardsJson);
      const { data, error } = await admin.from("level_rules").upsert({ level_no: input.levelNo, name: input.name, description: input.description || null, required_exp: input.requiredExp, rewards, is_active: true, updated_at: new Date().toISOString() }, { onConflict: "level_no" }).select("*").single();
      if (error) return fail("레벨 설정을 저장하지 못했습니다.", 400, "LEVEL_SAVE_FAILED", error.message);
      return ok(data, 201);
    }

    if (body.action === "delete-level") {
      const input = z.object({ id: z.uuid() }).parse(body);
      const { error } = await admin.from("level_rules").delete().eq("id", input.id);
      if (error) return fail("레벨 설정을 삭제하지 못했습니다.", 400, "LEVEL_DELETE_FAILED", error.message);
      return ok({ deleted: true });
    }

    if (body.action === "save-draw-exp") {
      const input = z.object({ drawId: z.uuid(), expPerDraw: z.coerce.number().int().min(0).max(1000000) }).parse(body);
      const { data, error } = await admin.from("draw_exp_settings").upsert({ draw_id: input.drawId, exp_per_draw: input.expPerDraw, updated_by: guard.auth.userId, updated_at: new Date().toISOString() }, { onConflict: "draw_id" }).select("*").single();
      if (error) return fail("뽑기 EXP 설정을 저장하지 못했습니다.", 400, "DRAW_EXP_SAVE_FAILED", error.message);
      return ok(data, 201);
    }

    if (body.action === "delete-draw-exp") {
      const input = z.object({ drawId: z.uuid() }).parse(body);
      const { error } = await admin.from("draw_exp_settings").delete().eq("draw_id", input.drawId);
      if (error) return fail("뽑기 EXP 설정을 삭제하지 못했습니다.", 400, "DRAW_EXP_DELETE_FAILED", error.message);
      return ok({ deleted: true });
    }

    if (body.action === "save-vip") {
      const input = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(400).optional().default(""), thresholdLevel: z.coerce.number().int().min(1).default(1), thresholdExp: z.coerce.number().int().min(0).default(0), attendanceRewardJson: z.string().optional().default(""), sortOrder: z.coerce.number().int().default(10) }).parse(body);
      const rewards = parseJsonArray(input.attendanceRewardJson);
      const { data, error } = await admin.from("vip_tiers").insert({ name: input.name, description: input.description || null, threshold_level: input.thresholdLevel, threshold_exp: input.thresholdExp, attendance_bonus_rewards: rewards, sort_order: input.sortOrder, created_by: guard.auth.userId }).select("*").single();
      if (error) return fail("VIP 등급을 저장하지 못했습니다.", 400, "VIP_SAVE_FAILED", error.message);
      return ok(data, 201);
    }

    if (body.action === "toggle-vip") {
      const input = z.object({ id: z.uuid(), isActive: z.boolean() }).parse(body);
      const { error } = await admin.from("vip_tiers").update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq("id", input.id);
      if (error) return fail("VIP 상태를 변경하지 못했습니다.", 400, "VIP_TOGGLE_FAILED", error.message);
      return ok({ changed: true });
    }

    if (body.action === "delete-vip") {
      const input = z.object({ id: z.uuid() }).parse(body);
      const { error } = await admin.from("vip_tiers").delete().eq("id", input.id);
      if (error) return fail("VIP 등급을 삭제하지 못했습니다.", 400, "VIP_DELETE_FAILED", error.message);
      return ok({ deleted: true });
    }

    if (body.action === "save-badge") {
      const input = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(300).optional().default(""), icon: z.string().trim().max(20).optional().default("🏅"), labelColor: z.string().trim().max(30).optional().default("#111827") }).parse(body);
      const { data, error } = await admin.from("badges").insert({ name: input.name, description: input.description || null, icon: input.icon, label_color: input.labelColor, created_by: guard.auth.userId }).select("*").single();
      if (error) return fail("배지를 저장하지 못했습니다.", 400, "BADGE_SAVE_FAILED", error.message);
      return ok(data, 201);
    }

    if (body.action === "delete-badge") {
      const input = z.object({ id: z.uuid() }).parse(body);
      const { error } = await admin.from("badges").delete().eq("id", input.id);
      if (error) return fail("배지를 삭제하지 못했습니다.", 400, "BADGE_DELETE_FAILED", error.message);
      return ok({ deleted: true });
    }

    if (body.action === "grant-badge") {
      const input = z.object({ profileId: z.uuid(), badgeId: z.uuid() }).parse(body);
      const { data, error } = await admin.from("profile_badges").upsert({ profile_id: input.profileId, badge_id: input.badgeId, granted_by: guard.auth.userId, granted_at: new Date().toISOString() }, { onConflict: "profile_id,badge_id" }).select("*").single();
      if (error) return fail("배지를 지급하지 못했습니다.", 400, "BADGE_GRANT_FAILED", error.message);
      return ok(data, 201);
    }

    if (body.action === "adjust-exp") {
      const input = z.object({ profileId: z.uuid(), amount: z.coerce.number().int(), reason: z.string().trim().min(1).max(200) }).parse(body);
      const { data: current } = await admin.from("profile_growth").select("exp_total").eq("profile_id", input.profileId).maybeSingle();
      const before = Number((current as { exp_total?: number } | null)?.exp_total ?? 0);
      const after = Math.max(0, before + input.amount);
      const { error } = await admin.from("profile_growth").upsert({ profile_id: input.profileId, exp_total: after, updated_at: new Date().toISOString() }, { onConflict: "profile_id" });
      if (error) return fail("EXP를 조정하지 못했습니다.", 400, "EXP_ADJUST_FAILED", error.message);
      await admin.from("exp_logs").insert({ profile_id: input.profileId, amount: input.amount, before_exp: before, after_exp: after, reason: input.reason, source_type: "ADMIN_ADJUST", created_by: guard.auth.userId, ip_address: meta.ip, user_agent: meta.userAgent });
      await syncLevel(admin, input.profileId);
      return ok({ before, after });
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.", 400, "GROWTH_ACTION_FAILED");
  }

  return fail("지원하지 않는 성장 관리 작업입니다.", 404, "UNKNOWN_GROWTH_ACTION");
}
