import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  imageUrl: z.string().trim().url().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  stock: z.number().int().min(0).nullable().optional(),
  isInventoryItem: z.boolean().optional(),
  isExchangeMaterial: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("상품 정보를 확인해 주세요.", 422);
  const admin = createAdminClient();
  const { data: current } = await admin.from("rewards").select("*").eq("id", id).maybeSingle();
  if (!current) return fail("상품을 찾을 수 없습니다.", 404);
  const nextInventoryItem = parsed.data.isInventoryItem ?? current.is_inventory_item;
  const nextExchangeMaterial = parsed.data.isExchangeMaterial ?? current.is_exchange_material;
  if (nextExchangeMaterial && !nextInventoryItem) return fail("교환 재료는 회원 보관 상품이어야 합니다.", 422, "INVALID_REWARD_FLAGS");
  if (!nextInventoryItem && current.is_inventory_item) {
    const [{ count: ownedCount }, { count: ruleCount }] = await Promise.all([
      admin.from("participant_items").select("profile_id", { count: "exact", head: true }).eq("reward_id", id).gt("quantity", 0),
      admin.from("exchange_rules").select("id", { count: "exact", head: true }).eq("is_active", true).or(`source_reward_id.eq.${id},target_reward_id.eq.${id}`),
    ]);
    if ((ownedCount ?? 0) > 0 || (ruleCount ?? 0) > 0) return fail("회원이 보유 중이거나 활성 교환 규칙에 연결된 상품은 보관 상품 설정을 끌 수 없습니다.", 409, "REWARD_IN_USE");
  }
  if (parsed.data.isActive === false && current.is_active) {
    if (current.probability_units !== 0) return fail("확률을 0%로 저장한 뒤 상품을 비활성화해 주세요.", 409, "REWARD_HAS_PROBABILITY");
    const [{ count: ownedCount }, { count: ruleCount }] = await Promise.all([
      admin.from("participant_items").select("profile_id", { count: "exact", head: true }).eq("reward_id", id).gt("quantity", 0),
      admin.from("exchange_rules").select("id", { count: "exact", head: true }).eq("is_active", true).or(`source_reward_id.eq.${id},target_reward_id.eq.${id}`),
    ]);
    if ((ownedCount ?? 0) > 0) return fail("회원이 보유 중인 상품은 비활성화할 수 없습니다.", 409, "REWARD_OWNED_BY_MEMBER");
    if ((ruleCount ?? 0) > 0) return fail("활성 교환 규칙에 연결된 상품입니다. 교환 규칙을 먼저 꺼 주세요.", 409, "REWARD_USED_BY_RULE");
  }
  const patch: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description;
  if (d.imageUrl !== undefined) patch.image_url = d.imageUrl || null;
  if (d.color !== undefined) patch.color = d.color;
  if (d.stock !== undefined) patch.stock = d.stock;
  if (d.isInventoryItem !== undefined) patch.is_inventory_item = d.isInventoryItem;
  if (d.isExchangeMaterial !== undefined) patch.is_exchange_material = d.isExchangeMaterial;
  if (d.isActive !== undefined) patch.is_active = d.isActive;
  const { data, error } = await admin.from("rewards").update(patch).eq("id", id).select("*").single();
  if (error) return fail("상품을 수정하지 못했습니다.", 400, "REWARD_UPDATE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "REWARD_UPDATED", p_target_table: "rewards", p_target_id: id, p_details: patch, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const admin = createAdminClient();
  const { data: reward } = await admin.from("rewards").select("*").eq("id", id).maybeSingle();
  if (!reward) return fail("상품을 찾을 수 없습니다.", 404);
  if (reward.probability_units !== 0) return fail("확률을 0%로 저장한 뒤 상품을 비활성화해 주세요.", 409, "REWARD_HAS_PROBABILITY");
  const [{ count: ownedCount }, { count: ruleCount }] = await Promise.all([
    admin.from("participant_items").select("profile_id", { count: "exact", head: true }).eq("reward_id", id).gt("quantity", 0),
    admin.from("exchange_rules").select("id", { count: "exact", head: true }).eq("is_active", true).or(`source_reward_id.eq.${id},target_reward_id.eq.${id}`),
  ]);
  if ((ownedCount ?? 0) > 0) return fail("회원이 보유 중인 상품은 비활성화할 수 없습니다.", 409, "REWARD_OWNED_BY_MEMBER");
  if ((ruleCount ?? 0) > 0) return fail("활성 교환 규칙에 연결된 상품입니다. 교환 규칙을 먼저 꺼 주세요.", 409, "REWARD_USED_BY_RULE");
  const { error } = await admin.from("rewards").update({ is_active: false }).eq("id", id);
  if (error) return fail("상품을 비활성화하지 못했습니다.", 400);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "REWARD_DEACTIVATED", p_target_table: "rewards", p_target_id: id, p_details: { name: reward.name }, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok({ id, deactivated: true });
}
