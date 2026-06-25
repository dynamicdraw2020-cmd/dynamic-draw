import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  sourceRewardId: z.uuid(),
  sourceQuantity: z.number().int().min(1).max(100000),
  targetRewardId: z.uuid(),
  targetQuantity: z.number().int().min(1).max(100000),
}).refine((value) => value.sourceRewardId !== value.targetRewardId, { message: "차감 상품과 지급 상품은 달라야 합니다." });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "교환 규칙을 확인해 주세요.", 422);
  const admin = createAdminClient();
  const { data: rewards, error: rewardsError } = await admin
    .from("rewards")
    .select("id,name,is_active,is_inventory_item")
    .in("id", [parsed.data.sourceRewardId, parsed.data.targetRewardId]);
  if (rewardsError || !rewards || rewards.length !== 2) return fail("선택한 상품을 찾을 수 없습니다.", 404, "REWARD_NOT_FOUND");
  const invalidReward = rewards.find((reward) => !reward.is_active || !reward.is_inventory_item);
  if (invalidReward) return fail(`“${invalidReward.name}” 상품은 활성화된 보관 상품이어야 합니다.`, 409, "REWARD_NOT_EXCHANGEABLE");
  const { data: maxRow } = await admin.from("exchange_rules").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("exchange_rules").insert({
    name: parsed.data.name,
    source_reward_id: parsed.data.sourceRewardId,
    source_quantity: parsed.data.sourceQuantity,
    target_reward_id: parsed.data.targetRewardId,
    target_quantity: parsed.data.targetQuantity,
    sort_order: (maxRow?.sort_order ?? 0) + 10,
    created_by: guard.auth.userId,
  }).select("*").single();
  if (error) return fail("교환 규칙을 만들지 못했습니다.", 400, "RULE_CREATE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "EXCHANGE_RULE_CREATED", p_target_table: "exchange_rules", p_target_id: data.id, p_details: data, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data, 201);
}
