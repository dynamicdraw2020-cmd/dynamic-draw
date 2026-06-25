import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  siteName: z.string().trim().min(2).max(50),
  heroTitle: z.string().trim().min(2).max(100),
  heroDescription: z.string().trim().min(2).max(500),
  publicStats: z.boolean(),
});

export async function PATCH(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("SUPER_ADMIN"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("설정값을 확인해 주세요.", 422);
  const admin = createAdminClient();
  const rows = [
    { key: "site_name", value: parsed.data.siteName, is_public: true, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
    { key: "hero_title", value: parsed.data.heroTitle, is_public: true, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
    { key: "hero_description", value: parsed.data.heroDescription, is_public: true, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
    { key: "public_stats", value: parsed.data.publicStats, is_public: true, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
  ];
  const { error } = await admin.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) return fail("설정을 저장하지 못했습니다.", 400, "SETTINGS_UPDATE_FAILED", error.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "SETTINGS_UPDATED", p_target_table: "site_settings", p_target_id: null, p_details: parsed.data, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(parsed.data);
}
