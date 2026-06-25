import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  sourceQuantity: z.number().int().min(1).optional(),
  targetQuantity: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("교환 규칙을 확인해 주세요.", 422);
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.sourceQuantity !== undefined) patch.source_quantity = parsed.data.sourceQuantity;
  if (parsed.data.targetQuantity !== undefined) patch.target_quantity = parsed.data.targetQuantity;
  if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;
  const admin = createAdminClient();
  if (parsed.data.isActive === true) {
    const { data: rule } = await admin.from("exchange_rules").select("source_reward_id,target_reward_id").eq("id", id).maybeSingle();
    if (!rule) return fail("교환 규칙을 찾을 수 없습니다.", 404);
    const { data: rewards } = await admin.from("rewards").select("id,name,is_active,is_inventory_item").in("id", [rule.source_reward_id, rule.target_reward_id]);
    const invalidReward = !rewards || rewards.length !== 2 || rewards.find((reward) => !reward.is_active || !reward.is_inventory_item);
    if (invalidReward) return fail("연결된 상품이 비활성 상태이거나 보관 상품이 아니어서 규칙을 켤 수 없습니다.", 409, "RULE_REWARD_INVALID");
  }
  const { data, error } = await admin.from("exchange_rules").update(patch).eq("id", id).select("*").single();
  if (error) return fail("교환 규칙을 수정하지 못했습니다.", 400);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "EXCHANGE_RULE_UPDATED", p_target_table: "exchange_rules", p_target_id: id, p_details: patch, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const admin = createAdminClient();
  const { error } = await admin.from("exchange_rules").update({ is_active: false }).eq("id", id);
  if (error) return fail("교환 규칙을 비활성화하지 못했습니다.", 400);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "EXCHANGE_RULE_DEACTIVATED", p_target_table: "exchange_rules", p_target_id: id, p_details: {}, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok({ id, deactivated: true });
}
