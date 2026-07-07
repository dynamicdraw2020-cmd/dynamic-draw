import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { normalizeDonationSettings } from "@/lib/donations";
import { createAdminClient } from "@/lib/supabase/admin";

const tierSchema = z.object({
  id: z.string().trim().max(80).optional().default(""),
  title: z.string().trim().min(1).max(80),
  badge: z.string().trim().max(24).optional().default("SUPPORT"),
  minAmount: z.number().int().min(0).max(1_000_000_000),
  maxAmount: z.number().int().min(0).max(1_000_000_000).nullable().optional().default(null),
  benefits: z.array(z.string().trim().min(1).max(200)).min(1).max(12),
  note: z.string().trim().max(300).optional().default(""),
  sortOrder: z.number().int().min(0).max(9999).optional().default(10),
});

const schema = z.object({
  enabled: z.boolean(),
  showHomeBanner: z.boolean(),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().min(1).max(400),
  heroMessage: z.string().trim().min(1).max(600),
  ctaLabel: z.string().trim().min(1).max(50),
  ctaUrl: z.string().trim().min(1).max(500),
  accountInfo: z.string().trim().min(1).max(1200),
  guideTitle: z.string().trim().min(1).max(100),
  guideBody: z.string().trim().min(1).max(1600),
  disclaimer: z.string().trim().min(1).max(1200),
  tiers: z.array(tierSchema).min(1).max(20),
});

export async function PATCH(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("후원 설정값을 확인해 주세요.", 422, "DONATION_SETTINGS_INVALID", parsed.error.flatten());

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const settings = normalizeDonationSettings({ ...parsed.data, updatedAt: now });
  const rowWithActor = { key: "donation_settings", value: settings, is_public: true, updated_by: guard.auth.userId, updated_at: now };
  const rowWithoutActor = { key: "donation_settings", value: settings, is_public: true, updated_at: now };

  const first = await admin.from("site_settings").upsert(rowWithActor, { onConflict: "key" });
  const second = first.error ? await admin.from("site_settings").upsert(rowWithoutActor, { onConflict: "key" }) : first;
  if (second.error) return fail("후원 설정을 저장하지 못했습니다.", 400, "DONATION_SETTINGS_SAVE_FAILED", { first: first.error?.message, second: second.error.message });

  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "DONATION_SETTINGS_UPDATED",
    p_target_table: "site_settings",
    p_target_id: "donation_settings",
    p_details: settings,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok(settings);
}
