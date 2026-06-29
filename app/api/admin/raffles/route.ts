import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
const schema = z.object({ title: z.string().trim().min(2).max(100), description: z.string().trim().max(800).optional().nullable(), prizeName: z.string().trim().min(1).max(120), isPublic: z.boolean().optional().default(true), startsAt: z.string().nullable().optional(), endsAt: z.string().nullable().optional(), requiredTierId: z.string().uuid().nullable().optional() });
function emptyToNull(value: string | null | undefined) { const text = (value ?? "").trim(); return text.length ? text : null; }
export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "추첨 이벤트 정보를 확인해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient(); const { data, error } = await admin.from("raffle_events").insert({ title: parsed.data.title, description: emptyToNull(parsed.data.description), prize_name: parsed.data.prizeName, status: "ACTIVE", is_public: parsed.data.isPublic, starts_at: parsed.data.startsAt || null, ends_at: parsed.data.endsAt || null, created_by: guard.auth.userId, required_member_tier_id: parsed.data.requiredTierId || null }).select("*").single();
  if (error || !data) return fail("추첨 이벤트를 만들지 못했습니다.", 400, "RAFFLE_CREATE_FAILED", error?.message);
  const meta = requestMeta(request); await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "RAFFLE_EVENT_CREATED", p_target_table: "raffle_events", p_target_id: data.id, p_details: data, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data, 201);
}
