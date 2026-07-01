import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiCapability, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
const schema = z.object({
  currencyId: z.uuid(),
  profileId: z.uuid(),
  amount: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(2, "회수 사유를 2글자 이상 입력해 주세요.").max(300),
  memo: z.string().trim().max(300).optional().default(""),
});

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiCapability("GRANT_REWARD");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "포인트 회수 정보를 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());
  }

  const admin = createAdminClient();
  const meta = requestMeta(request);
  const { data, error } = await admin.rpc("admin_recover_currency_balance", {
    p_currency_id: parsed.data.currencyId,
    p_profile_id: parsed.data.profileId,
    p_amount: parsed.data.amount,
    p_admin_id: guard.auth.userId,
    p_reason: parsed.data.reason,
    p_memo: parsed.data.memo ?? "",
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  if (error) return fail(error.message || "포인트를 회수하지 못했습니다.", 400, "CURRENCY_RECOVERY_FAILED", error.code);
  return ok(data, 201);
}

export const POST = withApiRoute(postHandler, { routeName: "/api/admin/recover-currency", rateLimit: { kind: "recovery", limit: 5, windowSeconds: 60 } });
