import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ENDED"]).optional(),
  animationMs: z.number().int().min(3000).max(5000).optional(),
  isPublic: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("수정 내용을 확인해 주세요.", 422);
  const admin = createAdminClient();

  if (parsed.data.status === "ACTIVE") {
    const { data: readiness, error: readinessError } = await admin.rpc("validate_draw_ready", { p_draw_id: id });
    if (readinessError || readiness !== true) return fail(readinessError?.message ?? "확률 합계와 상품 재고를 먼저 확인해 주세요.", 409, "DRAW_NOT_READY");
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.animationMs !== undefined) patch.animation_ms = parsed.data.animationMs;
  if (parsed.data.isPublic !== undefined) patch.is_public = parsed.data.isPublic;
  const { data, error } = await admin.from("draws").update(patch).eq("id", id).select("*").single();
  if (error) return fail("뽑기를 수정하지 못했습니다.", 400, "DRAW_UPDATE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "DRAW_UPDATED", p_target_table: "draws", p_target_id: id, p_details: patch, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data);
}
