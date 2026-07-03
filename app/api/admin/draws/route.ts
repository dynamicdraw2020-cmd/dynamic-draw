import { randomUUID } from "node:crypto";
import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  animationMs: z.number().int().min(3000).max(5000).default(4000),
});

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("뽑기 정보를 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());
  const admin = createAdminClient();
  const slug = `draw-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const { data, error } = await admin.from("draws").insert({
    name: parsed.data.name,
    slug,
    description: parsed.data.description || null,
    animation_ms: parsed.data.animationMs,
    created_by: guard.auth.userId,
  }).select("*").single();
  if (error) return fail("뽑기를 생성하지 못했습니다.", 400, "DRAW_CREATE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "DRAW_CREATED", p_target_table: "draws", p_target_id: data.id, p_details: data, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data, 201);
}
