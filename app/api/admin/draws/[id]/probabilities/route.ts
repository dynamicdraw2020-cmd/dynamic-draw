import { z } from "zod";
import { databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  reason: z.string().trim().min(2).max(200),
  probabilities: z.array(z.object({ rewardId: z.uuid(), percent: z.number().min(0).max(100) })).min(1),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "확률을 확인해 주세요.", 422);
  const probabilities = parsed.data.probabilities.map((item) => ({ reward_id: item.rewardId, probability_units: Math.round(item.percent * 10_000) }));
  const total = probabilities.reduce((sum, item) => sum + item.probability_units, 0);
  if (total !== 1_000_000) return fail(`확률 합계가 ${(total / 10_000).toFixed(4)}%입니다. 정확히 100%로 맞춰 주세요.`, 422, "PROBABILITY_TOTAL_INVALID");
  const admin = createAdminClient();
  const meta = requestMeta(request);
  const { data, error } = await admin.rpc("admin_update_probabilities", {
    p_draw_id: id,
    p_probabilities: probabilities,
    p_reason: parsed.data.reason,
    p_admin_id: guard.auth.userId,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });
  if (error) return fail(databaseRpcErrorMessage(error, "확률을 저장하지 못했습니다."), 400, "PROBABILITY_UPDATE_FAILED");
  return ok(data);
}
