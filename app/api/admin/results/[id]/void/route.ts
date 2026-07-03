import { z } from "zod";
import { databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ reason: z.string().trim().min(2).max(300) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("SUPER_ADMIN"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("무효 처리 사유를 입력해 주세요.", 422);
  const meta = requestMeta(request);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("void_result", { p_result_id: id, p_admin_id: guard.auth.userId, p_reason: parsed.data.reason, p_ip: meta.ip, p_user_agent: meta.userAgent });
  if (!error) return ok(data);
  const { data: fallback, error: fallbackError } = await admin
    .from("results")
    .update({ voided_at: new Date().toISOString(), void_reason: parsed.data.reason, voided_by: guard.auth.userId })
    .eq("id", id)
    .is("voided_at", null)
    .select("*")
    .maybeSingle();
  if (fallbackError) return fail(databaseRpcErrorMessage(fallbackError, "결과를 무효 처리하지 못했습니다."), 409, "RESULT_VOID_FALLBACK_FAILED");
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "RESULT_VOIDED", p_target_table: "results", p_target_id: id, p_details: { reason: parsed.data.reason, fallback: true }, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(fallback ?? { id, voided: true });
}
