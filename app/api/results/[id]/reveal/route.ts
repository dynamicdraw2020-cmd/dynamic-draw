import { z } from "zod";
import { databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const adminRoles = new Set(["VIEWER", "MANAGER", "SUPER_ADMIN"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("결과 ID가 올바르지 않습니다.", 400, "INVALID_RESULT_ID");

  const admin = createAdminClient();
  const { data: result, error: resultError } = await admin.from("results").select("id,participant_id").eq("id", id).maybeSingle();
  if (resultError || !result) return fail("추첨 결과를 찾을 수 없습니다.", 404, "RESULT_NOT_FOUND");
  if (result.participant_id !== guard.auth.userId && !adminRoles.has(guard.auth.profile.role)) {
    return fail("본인의 추첨 결과만 공개할 수 있습니다.", 403, "RESULT_OWNER_REQUIRED");
  }

  const meta = requestMeta(request);
  const { data, error } = await admin.rpc("reveal_result", {
    p_result_id: id,
    p_admin_id: adminRoles.has(guard.auth.profile.role) ? guard.auth.userId : null,
    p_force: false,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });
  if (error) return fail(databaseRpcErrorMessage(error, "결과를 공개하지 못했습니다."), 409, "REVEAL_FAILED", error.code);
  return ok(data);
}
