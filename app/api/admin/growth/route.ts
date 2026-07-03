import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
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

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = bodySchema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const body = parsed.data as Record<string, unknown> & { action: string };
  const admin = createAdminClient();

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
      const input = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(400).optional().default(""), drawCountRequired: z.coerce.number().int().min(0).default(0), attendanceRewardJson: z.string().optional().default(""), sortOrder: z.coerce.number().int().default(10) }).parse(body);
      const rewards = parseJsonArray(input.attendanceRewardJson);
      const { data, error } = await admin.from("vip_tiers").insert({ name: input.name, description: input.description || null, threshold_level: 0, threshold_exp: 0, draw_count_required: input.drawCountRequired, attendance_bonus_rewards: rewards, sort_order: input.sortOrder, created_by: guard.auth.userId }).select("*").single();
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

    if (body.action === "grant-vip") {
      const input = z.object({ profileId: z.uuid(), vipTierId: z.uuid() }).parse(body);
      const { data: existing } = await admin.from("profile_growth").select("profile_id,level_no,exp_total").eq("profile_id", input.profileId).maybeSingle();
      const payload = { profile_id: input.profileId, level_no: Number((existing as { level_no?: number } | null)?.level_no ?? 1), exp_total: Number((existing as { exp_total?: number } | null)?.exp_total ?? 0), vip_tier_id: input.vipTierId, updated_at: new Date().toISOString() };
      const { data, error } = await admin.from("profile_growth").upsert(payload, { onConflict: "profile_id" }).select("*").single();
      if (error) return fail("VIP를 부여하지 못했습니다.", 400, "VIP_GRANT_FAILED", error.message);
      return ok(data, 201);
    }

    if (body.action === "clear-vip") {
      const input = z.object({ profileId: z.uuid() }).parse(body);
      const { error } = await admin.from("profile_growth").update({ vip_tier_id: null, updated_at: new Date().toISOString() }).eq("profile_id", input.profileId);
      if (error) return fail("VIP를 해제하지 못했습니다.", 400, "VIP_CLEAR_FAILED", error.message);
      return ok({ cleared: true });
    }

    if (body.action === "auto-grant-vip") {
      const input = z.object({ vipTierId: z.uuid() }).parse(body);
      const { data: tier } = await admin.from("vip_tiers").select("id,draw_count_required").eq("id", input.vipTierId).maybeSingle();
      const required = Math.max(0, Number((tier as { draw_count_required?: number } | null)?.draw_count_required ?? 0));
      const { data: results } = await admin.from("results").select("participant_id").not("revealed_at", "is", null).is("voided_at", null).limit(20000);
      const counts = new Map<string, number>();
      for (const row of (results ?? []) as Array<{ participant_id: string | null }>) {
        if (row.participant_id) counts.set(row.participant_id, (counts.get(row.participant_id) ?? 0) + 1);
      }
      let granted = 0;
      for (const [profileId, count] of counts) {
        if (count < required) continue;
        const { data: existing } = await admin.from("profile_growth").select("profile_id,level_no,exp_total").eq("profile_id", profileId).maybeSingle();
        const payload = { profile_id: profileId, level_no: Number((existing as { level_no?: number } | null)?.level_no ?? 1), exp_total: Number((existing as { exp_total?: number } | null)?.exp_total ?? 0), vip_tier_id: input.vipTierId, updated_at: new Date().toISOString() };
        const { error } = await admin.from("profile_growth").upsert(payload, { onConflict: "profile_id" });
        if (!error) granted += 1;
      }
      return ok({ grantedCount: granted, requiredDrawCount: required });
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
      const { data, error } = await admin.rpc("add_profile_exp", {
        p_profile_id: input.profileId,
        p_amount: input.amount,
        p_reason: input.reason,
        p_source_type: "ADMIN_ADJUST",
        p_source_id: `admin-adjust:${Date.now()}`,
        p_created_by: guard.auth.userId,
      });
      if (error) return fail("EXP를 조정하지 못했습니다.", 400, "EXP_ADJUST_FAILED", error.message);
      return ok(data ?? { adjusted: true });
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.", 400, "GROWTH_ACTION_FAILED");
  }

  return fail("지원하지 않는 성장 관리 작업입니다.", 404, "UNKNOWN_GROWTH_ACTION");
}
