import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiCapability, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
const schema = z.object({
  id: z.uuid(),
  status: z.enum(["OPEN", "ANSWERED", "CLOSED"]),
  adminReply: z.string().trim().max(2000).optional().default(""),
  internalMemo: z.string().trim().max(2000).optional().default(""),
});

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiCapability("SUPPORT_REPLY");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());

  const { error } = await createAdminClient()
    .from("support_tickets")
    .update({
      status: parsed.data.status,
      admin_reply: parsed.data.adminReply,
      internal_memo: parsed.data.internalMemo,
      assigned_admin_id: guard.auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id);

  if (error) return fail("문의 답변을 저장하지 못했습니다.", 400, "SUPPORT_UPDATE_FAILED", error.message);
  return ok({ id: parsed.data.id });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/admin/support", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
