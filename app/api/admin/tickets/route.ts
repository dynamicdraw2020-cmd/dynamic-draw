import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  drawId: z.uuid(),
  profileId: z.uuid(),
  quantity: z.number().int().min(1).max(1000),
  memo: z.string().trim().max(200).optional().nullable(),
});

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "추첨권 지급 정보를 확인해 주세요.", 422, "VALIDATION_ERROR");

  const admin = createAdminClient();
  const meta = requestMeta(request);
  const { data, error } = await admin.rpc("admin_grant_draw_tickets", {
    p_draw_id: parsed.data.drawId,
    p_profile_id: parsed.data.profileId,
    p_quantity: parsed.data.quantity,
    p_admin_id: guard.auth.userId,
    p_memo: parsed.data.memo ?? "",
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  if (error) return fail(error.message || "추첨권을 지급하지 못했습니다.", 400, "TICKET_GRANT_FAILED", error.code);
  return ok(data, 201);
}
