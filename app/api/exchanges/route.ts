import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ ruleId: z.uuid(), idempotencyKey: z.uuid() });

type RewardLite = { id: string; name: string; product_catalog_id: string | null; is_active: boolean };
type ItemRow = { profile_id: string; reward_id: string; quantity: number; rewards?: RewardLite | RewardLite[] | null };

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  if (guard.auth.profile.role !== "USER") return fail("일반 회원 계정만 교환할 수 있습니다.", 403, "USER_ROLE_REQUIRED");
  const limited = await enforceRateLimit(`exchange:${guard.auth.userId}`, 10, 60); if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("교환 규칙 정보가 올바르지 않습니다.", 422);

  const admin = createAdminClient();
  const { data: existing } = await admin.from("exchange_logs").select("*").eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
  if (existing) return ok({ exchangeLogId: existing.id, duplicate: true }, 200);

  const { data: rule, error: ruleError } = await admin
    .from("exchange_rules")
    .select("id,name,source_reward_id,source_quantity,target_reward_id,target_quantity,is_active")
    .eq("id", parsed.data.ruleId)
    .maybeSingle();
  if (ruleError || !rule || !rule.is_active) return fail("현재 사용할 수 없는 교환 규칙입니다.", 404, "EXCHANGE_RULE_NOT_FOUND");

  const { data: rewards, error: rewardError } = await admin
    .from("rewards")
    .select("id,name,product_catalog_id,is_active")
    .in("id", [rule.source_reward_id, rule.target_reward_id]);
  if (rewardError || !rewards) return fail("교환 상품 정보를 확인하지 못했습니다.", 400, "EXCHANGE_REWARD_FETCH_FAILED", rewardError?.message);

  const sourceReward = (rewards as RewardLite[]).find((item) => item.id === rule.source_reward_id);
  const targetReward = (rewards as RewardLite[]).find((item) => item.id === rule.target_reward_id);
  if (!sourceReward || !targetReward || !sourceReward.is_active || !targetReward.is_active) return fail("교환 상품이 비활성 상태입니다.", 409, "EXCHANGE_REWARD_INACTIVE");

  const { data: itemRows, error: itemError } = await admin
    .from("participant_items")
    .select("profile_id,reward_id,quantity,rewards(id,name,product_catalog_id,is_active)")
    .eq("profile_id", guard.auth.userId)
    .gt("quantity", 0);
  if (itemError) return fail("보유 상품을 확인하지 못했습니다.", 400, "INVENTORY_FETCH_FAILED", itemError.message);

  const matchingItems = ((itemRows ?? []) as ItemRow[])
    .filter((row) => {
      const reward = Array.isArray(row.rewards) ? row.rewards[0] : row.rewards;
      if (!reward?.is_active) return false;
      if (row.reward_id === sourceReward.id) return true;
      return Boolean(sourceReward.product_catalog_id && reward.product_catalog_id === sourceReward.product_catalog_id);
    })
    .sort((a, b) => a.reward_id === sourceReward.id ? -1 : b.reward_id === sourceReward.id ? 1 : 0);

  const owned = matchingItems.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  if (owned < rule.source_quantity) return fail(`교환 재료 수량이 부족합니다. 필요 ${rule.source_quantity}, 보유 ${owned}`, 409, "EXCHANGE_NOT_ENOUGH_ITEMS");

  let remaining = rule.source_quantity;
  for (const row of matchingItems) {
    if (remaining <= 0) break;
    const use = Math.min(Number(row.quantity ?? 0), remaining);
    const next = Number(row.quantity ?? 0) - use;
    remaining -= use;
    if (next > 0) {
      const { error } = await admin.from("participant_items").update({ quantity: next, updated_at: new Date().toISOString() }).eq("profile_id", guard.auth.userId).eq("reward_id", row.reward_id);
      if (error) return fail("교환 재료 차감에 실패했습니다.", 400, "EXCHANGE_SOURCE_DEDUCT_FAILED", error.message);
    } else {
      const { error } = await admin.from("participant_items").delete().eq("profile_id", guard.auth.userId).eq("reward_id", row.reward_id);
      if (error) return fail("교환 재료 차감에 실패했습니다.", 400, "EXCHANGE_SOURCE_DELETE_FAILED", error.message);
    }
  }

  const { data: targetExisting } = await admin.from("participant_items").select("quantity").eq("profile_id", guard.auth.userId).eq("reward_id", targetReward.id).maybeSingle();
  const targetNext = Number((targetExisting as { quantity?: number } | null)?.quantity ?? 0) + Number(rule.target_quantity ?? 1);
  const { error: targetError } = await admin.from("participant_items").upsert({ profile_id: guard.auth.userId, reward_id: targetReward.id, quantity: targetNext, updated_at: new Date().toISOString() }, { onConflict: "profile_id,reward_id" });
  if (targetError) return fail("교환 상품 지급에 실패했습니다.", 400, "EXCHANGE_TARGET_GRANT_FAILED", targetError.message);

  const meta = requestMeta(request);
  const { data: log, error: logError } = await admin.from("exchange_logs").insert({
    rule_id: rule.id,
    profile_id: guard.auth.userId,
    source_reward_id: sourceReward.id,
    source_quantity: rule.source_quantity,
    target_reward_id: targetReward.id,
    target_quantity: rule.target_quantity,
    idempotency_key: parsed.data.idempotencyKey,
    ip_address: meta.ip,
    user_agent: meta.userAgent,
  }).select("*").single();
  if (logError) return fail("교환 로그 저장에 실패했습니다.", 400, "EXCHANGE_LOG_FAILED", logError.message);

  return ok({ exchangeLogId: log.id, sourceRewardName: sourceReward.name, sourceQuantity: rule.source_quantity, targetRewardName: targetReward.name, targetQuantity: rule.target_quantity, duplicate: false }, 201);
}
