import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const imageInputSchema = z.string().trim().max(1_400_000).refine((value) => value.length === 0 || /^https?:\/\//.test(value) || /^data:image\/png;base64,/.test(value), "PNG 파일 또는 이미지 URL을 확인해 주세요.");

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  imageUrl: imageInputSchema.optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#111111"),
  defaultStock: z.number().int().min(0).nullable().optional(),
  isInventoryItem: z.boolean().default(true),
  isExchangeMaterial: z.boolean().default(false),
}).refine((value) => !value.isExchangeMaterial || value.isInventoryItem, { message: "교환 재료는 회원 보관 상품으로 설정해야 합니다." });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "상품 정보를 확인해 주세요.", 422);
  const admin = createAdminClient();
  const { data: maxRow } = await admin.from("product_catalog").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("product_catalog").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
    image_url: parsed.data.imageUrl || null,
    color: parsed.data.color,
    default_stock: parsed.data.defaultStock ?? null,
    is_inventory_item: parsed.data.isInventoryItem,
    is_exchange_material: parsed.data.isExchangeMaterial,
    sort_order: (maxRow?.sort_order ?? 0) + 10,
  }).select("*").single();
  if (error) return fail("상품 보관함에 추가하지 못했습니다.", 400, "PRODUCT_CREATE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "PRODUCT_CREATED", p_target_table: "product_catalog", p_target_id: data.id, p_details: data, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data, 201);
}
