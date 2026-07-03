import { z } from "zod";
import { databaseRpcErrorMessage, enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ participantId: z.uuid(), idempotencyKey: z.uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const limited = await enforceRateLimit(`spin:${guard.auth.userId}`, 12, 60); if (limited) return limited;
  const { id } = await context.params;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("참가자 정보가 올바르지 않습니다.", 422);
  const meta = requestMeta(request);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_execute_draw_with_ticket", {
    p_draw_id: id,
    p_participant_id: parsed.data.participantId,
    p_admin_id: guard.auth.userId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });
  if (error) return fail(databaseRpcErrorMessage(error, "추첨을 실행하지 못했습니다."), 409, "DRAW_EXECUTION_FAILED");
  return ok(data, 201);
}
