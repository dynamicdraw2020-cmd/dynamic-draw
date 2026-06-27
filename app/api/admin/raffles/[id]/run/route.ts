import { z } from "zod";
import { databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params; if (!z.uuid().safeParse(id).success) return fail("추첨 이벤트 ID가 올바르지 않습니다.", 400, "INVALID_RAFFLE_ID");
  const meta = requestMeta(request); const admin = createAdminClient(); const { data, error } = await admin.rpc("execute_member_raffle", { p_raffle_id: id, p_admin_id: guard.auth.userId, p_ip: meta.ip, p_user_agent: meta.userAgent });
  if (error) return fail(databaseRpcErrorMessage(error, "전체 회원 추첨을 실행하지 못했습니다."), 409, "RAFFLE_RUN_FAILED", error.code);
  return ok(data, 201);
}
