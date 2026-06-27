import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const imageInputSchema = z.string().trim().max(1_400_000).refine((value) => value.length === 0 || /^https?:\/\//.test(value) || /^data:image\/png;base64,/.test(value), "PNG 파일 또는 이미지 URL을 확인해 주세요.");

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  imageUrl: imageInputSchema.nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  defaultStock: z.number().int().min(0).nullable().optional(),
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
  const d = parsed.data;
  if (d.isExchangeMaterial && d.isInventoryItem === false) return fail("교환 재료는 회원 보관 상품이어야 합니다.", 422);
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description;
  if (d.imageUrl !== undefined) patch.image_url = d.imageUrl || null;
  if (d.color !== undefined) patch.color = d.color;
  if (d.defaultStock !== undefined) patch.default_stock = d.defaultStock;
  if (d.isInventoryItem !== undefined) patch.is_inventory_item = d.isInventoryItem;
  if (d.isExchangeMaterial !== undefined) patch.is_exchange_material = d.isExchangeMaterial;
  if (d.isActive !== undefined) patch.is_active = d.isActive;
  const admin = createAdminClient();
  const { data, error } = await admin.from("product_catalog").update(patch).eq("id", id).is("deleted_at", null).select("*").single();
  if (error) return fail("상품을 수정하지 못했습니다.", 400, "PRODUCT_UPDATE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "PRODUCT_UPDATED", p_target_table: "product_catalog", p_target_id: id, p_details: patch, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const admin = createAdminClient();
  const [{ count: linkedCount }, { data: product }] = await Promise.all([
    admin.from("rewards").select("id", { count: "exact", head: true }).eq("product_catalog_id", id).eq("is_active", true),
    admin.from("product_catalog").select("name").eq("id", id).maybeSingle(),
  ]);
  if ((linkedCount ?? 0) > 0) return fail("뽑기에 연결된 상품입니다. 뽑기에서 먼저 삭제해 주세요.", 409, "PRODUCT_LINKED");
  const { error } = await admin.from("product_catalog").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", id);
  if (error) return fail("상품을 삭제하지 못했습니다.", 400, "PRODUCT_DELETE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "PRODUCT_DELETED", p_target_table: "product_catalog", p_target_id: id, p_details: { name: product?.name }, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok({ id, deleted: true });
}
