import { z } from "zod";
import { databaseRpcErrorMessage, enforceRateLimit, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ idempotencyKey: z.uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  if (guard.auth.profile.role !== "USER") return fail("일반 회원만 직접 뽑기를 실행할 수 있습니다.", 403, "USER_ROLE_REQUIRED");
  const limited = await enforceRateLimit(`self-spin:${guard.auth.userId}`, 20, 60); if (limited) return limited;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("뽑기 ID가 올바르지 않습니다.", 400, "INVALID_DRAW_ID");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("중복 방지 키가 올바르지 않습니다.", 422, "VALIDATION_ERROR");

  const meta = requestMeta(request);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("user_execute_draw_with_ticket", {
    p_draw_id: id,
    p_profile_id: guard.auth.userId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  if (error) return fail(databaseRpcErrorMessage(error, "직접 뽑기를 실행하지 못했습니다."), 409, "SELF_DRAW_FAILED", error.code);
  return ok(data, 201);
}
