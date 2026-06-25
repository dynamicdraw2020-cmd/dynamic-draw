import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ reason: z.string().trim().min(2).max(300) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("SUPER_ADMIN"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("무효 처리 사유를 입력해 주세요.", 422);
  const meta = requestMeta(request);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("void_result", { p_result_id: id, p_admin_id: guard.auth.userId, p_reason: parsed.data.reason, p_ip: meta.ip, p_user_agent: meta.userAgent });
  if (error) return fail(error.message, 409, "RESULT_VOID_FAILED");
  return ok(data);
}
