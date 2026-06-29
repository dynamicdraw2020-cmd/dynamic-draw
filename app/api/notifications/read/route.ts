import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ notificationId: z.uuid().optional(), all: z.boolean().optional().default(false) });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("알림 정보를 확인해 주세요.", 422);
  const admin = createAdminClient();
  let query = admin.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("profile_id", guard.auth.userId);
  if (!parsed.data.all) {
    if (!parsed.data.notificationId) return fail("알림 ID가 필요합니다.", 422);
    query = query.eq("id", parsed.data.notificationId);
  }
  const { error } = await query;
  if (error) return fail("알림을 읽음 처리하지 못했습니다.", 400, "NOTIFICATION_READ_FAILED", error.message);
  return ok({ read: true });
}
