import { z } from "zod";
import { databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ reason: z.string().trim().min(2).max(300) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("SUPER_ADMIN"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("추첨 이벤트 ID가 올바르지 않습니다.", 400, "INVALID_RAFFLE_ID");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("재추첨 사유를 2자 이상 입력해 주세요.", 422, "REASON_REQUIRED");
  const meta = requestMeta(request);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("rerun_member_raffle", { p_raffle_id: id, p_admin_id: guard.auth.userId, p_reason: parsed.data.reason, p_ip: meta.ip, p_user_agent: meta.userAgent });
  if (error) return fail(databaseRpcErrorMessage(error, "전체 회원 재추첨을 실행하지 못했습니다."), 409, "RAFFLE_RERUN_FAILED", error.code);
  return ok(data, 201);
}
