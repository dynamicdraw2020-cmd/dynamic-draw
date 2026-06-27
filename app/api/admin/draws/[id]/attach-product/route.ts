import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ productId: z.uuid(), stock: z.number().int().min(0).nullable().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id: drawId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("연결할 상품을 확인해 주세요.", 422);
  const admin = createAdminClient();
  const { data: product } = await admin.from("product_catalog").select("*").eq("id", parsed.data.productId).is("deleted_at", null).eq("is_active", true).maybeSingle();
  if (!product) return fail("상품 보관함에서 상품을 찾을 수 없습니다.", 404, "PRODUCT_NOT_FOUND");
  const { data: existing } = await admin.from("rewards").select("id").eq("draw_id", drawId).eq("product_catalog_id", product.id).eq("is_active", true).maybeSingle();
  if (existing) return fail("이미 이 뽑기에 연결된 상품입니다.", 409, "PRODUCT_ALREADY_LINKED");
  const { data: maxRow } = await admin.from("rewards").select("sort_order").eq("draw_id", drawId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("rewards").insert({
    draw_id: drawId,
    product_catalog_id: product.id,
    name: product.name,
    description: product.description,
    image_url: product.image_url,
    color: product.color,
    stock: parsed.data.stock ?? product.default_stock ?? null,
    is_inventory_item: product.is_inventory_item,
    is_exchange_material: product.is_exchange_material,
    probability_units: 0,
    sort_order: (maxRow?.sort_order ?? 0) + 10,
  }).select("*").single();
  if (error) return fail("뽑기에 상품을 연결하지 못했습니다.", 400, "PRODUCT_ATTACH_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "PRODUCT_ATTACHED_TO_DRAW", p_target_table: "rewards", p_target_id: data.id, p_details: { drawId, productId: product.id }, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data, 201);
}
