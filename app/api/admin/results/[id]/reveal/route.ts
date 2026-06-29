import { databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const meta = requestMeta(request);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reveal_result", { p_result_id: id, p_admin_id: guard.auth.userId, p_force: false, p_ip: meta.ip, p_user_agent: meta.userAgent });
  if (error) return fail(databaseRpcErrorMessage(error, "결과를 공개하지 못했습니다."), 409, "RESULT_REVEAL_FAILED");
  await admin.rpc("award_growth_for_result", { p_result_id: id, p_actor_id: guard.auth.userId });
  return ok(data);
}
