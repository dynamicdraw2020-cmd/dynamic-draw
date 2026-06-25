import { z } from "zod";
import { enforceRateLimit, databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ ruleId: z.uuid(), idempotencyKey: z.uuid() });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  if (guard.auth.profile.role !== "USER") return fail("일반 회원 계정만 교환할 수 있습니다.", 403, "USER_ROLE_REQUIRED");
  const limited = await enforceRateLimit(`exchange:${guard.auth.userId}`, 10, 60); if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("교환 규칙 정보가 올바르지 않습니다.", 422);
  const meta = requestMeta(request);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("exchange_items", {
    p_profile_id: guard.auth.userId,
    p_rule_id: parsed.data.ruleId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });
  if (error) return fail(databaseRpcErrorMessage(error, "교환하지 못했습니다."), 409, "EXCHANGE_FAILED");
  return ok(data, 201);
}
