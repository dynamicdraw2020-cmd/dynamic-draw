import { z } from "zod";
import { enforceSameOrigin, fail, ok, readJsonWithLimit, rejectDemoMutation, requireApiAdmin, withApiRoute } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCouponVisibility, safeRewardArray } from "@/lib/step-event-config";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

const bodySchema = z.object({ action: z.string().trim().min(1) }).passthrough();

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

function parseCouponRewards(body: Record<string, unknown>) {
  const primary = {
    type: body.rewardType,
    amount: Number(body.rewardAmount ?? 1),
    currencyId: nullableText(body.currencyId),
    drawId: nullableText(body.drawId),
    rewardId: nullableText(body.rewardId),
    boxId: nullableText(body.boxId),
    label: nullableText(body.rewardLabel),
  };
  const rewards = safeRewardArray([primary]);
  const extraText = String(body.extraRewardsJson ?? "").trim();
  if (!extraText) return rewards;
  try {
    return [...rewards, ...safeRewardArray(JSON.parse(extraText))];
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

  const parsed = bodySchema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());

  const body = parsed.data as Record<string, unknown> & { action: string };
  const admin = createAdminClient();

  if (body.action === "create-coupon") {
    const schema = z.object({
      code: z.string().trim().min(3).max(40),
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(400).optional().default(""),
      codeType: z.enum(["COUPON", "EVENT_CODE"]).default("COUPON"),
      visibility: z.enum(["public", "hidden", "admin_only", "event_only"]).default("public"),
      targetMode: z.enum(["ALL", "PROFILE", "ROLE"]).default("ALL"),
      targetProfileId: z.string().optional().nullable(),
      targetRole: z.string().optional().nullable(),
      startsAt: z.string().optional().nullable(),
      endsAt: z.string().optional().nullable(),
      maxUses: z.number().int().min(1).optional().nullable(),
      perUserLimit: z.number().int().min(1).max(99).default(1),
    }).passthrough();
    const input = schema.parse(body);
    const rewards = parseCouponRewards(body);
    if (!rewards.length) return fail("쿠폰 보상을 최소 1개 설정해 주세요.", 422, "REWARD_REQUIRED");

    const { data, error } = await admin
      .from("promo_codes")
      .insert({
        code: input.code.toUpperCase(),
        name: input.name,
        description: input.description || null,
        code_type: input.codeType,
        visibility: input.visibility,
        target_mode: input.targetMode,
        target_profile_id: input.targetMode === "PROFILE" ? input.targetProfileId || null : null,
        target_role: input.targetMode === "ROLE" ? input.targetRole || null : null,
        starts_at: normalizeDateInput(input.startsAt),
        ends_at: normalizeDateInput(input.endsAt),
        max_uses: input.maxUses ?? null,
        per_user_limit: input.perUserLimit,
        rewards,
        created_by: guard.auth.userId,
      })
      .select("*")
      .single();
    if (error) return fail("쿠폰을 만들지 못했습니다.", 400, "COUPON_CREATE_FAILED", error.message);
    return ok(data, 201);
  }

  if (body.action === "update-visibility") {
    const schema = z.object({ codeId: z.string().uuid(), visibility: z.enum(["public", "hidden", "admin_only", "event_only"]) });
    const input = schema.parse(body);
    const visibility = normalizeCouponVisibility(input.visibility);
    const { error } = await admin.from("promo_codes").update({ visibility, updated_at: new Date().toISOString() }).eq("id", input.codeId);
    if (error) return fail("쿠폰 공개 상태를 변경하지 못했습니다.", 400, "COUPON_VISIBILITY_FAILED", error.message);
    return ok({ codeId: input.codeId, visibility });
  }

  if (body.action === "toggle-coupon") {
    const schema = z.object({ codeId: z.string().uuid(), isActive: z.boolean() });
    const input = schema.parse(body);
    const { error } = await admin.from("promo_codes").update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq("id", input.codeId);
    if (error) return fail("쿠폰 상태를 변경하지 못했습니다.", 400, "COUPON_TOGGLE_FAILED", error.message);
    return ok({ codeId: input.codeId, isActive: input.isActive });
  }

  if (body.action === "delete-coupon") {
    const schema = z.object({ codeId: z.string().uuid() });
    const input = schema.parse(body);
    const { error } = await admin.from("promo_codes").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", input.codeId);
    if (error) return fail("쿠폰을 삭제하지 못했습니다.", 400, "COUPON_DELETE_FAILED", error.message);
    return ok({ codeId: input.codeId });
  }

  return fail("지원하지 않는 쿠폰 관리 작업입니다.", 404, "UNKNOWN_COUPON_ACTION");
}

export const POST = withApiRoute(postHandler, {
  routeName: "/api/admin/coupons",
  rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 },
});
