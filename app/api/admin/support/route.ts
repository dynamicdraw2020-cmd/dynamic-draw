import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  action: z.enum(["reply", "delete"]).optional().default("reply"),
  id: z.uuid(),
  status: z.enum(["OPEN", "ANSWERED", "CLOSED"]).optional().default("ANSWERED"),
  adminReply: z.string().trim().max(2000).optional().default(""),
  internalMemo: z.string().trim().max(2000).optional().default(""),
});

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  if (parsed.data.action === "delete") {
    const { error } = await admin.from("support_tickets").delete().eq("id", parsed.data.id);
    if (error) return fail("문의를 삭제하지 못했습니다.", 400, "SUPPORT_DELETE_FAILED", error.message);
    return ok({ deleted: true });
  }
  const { error } = await admin.from("support_tickets").update({
    status: parsed.data.status,
    admin_reply: parsed.data.adminReply,
    answer: parsed.data.adminReply,
    internal_memo: parsed.data.internalMemo || null,
    assigned_admin_id: guard.auth.userId,
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.id);
  if (error) return fail("문의 답변을 저장하지 못했습니다.", 400, "SUPPORT_UPDATE_FAILED", error.message);
  return ok({ id: parsed.data.id });
}
