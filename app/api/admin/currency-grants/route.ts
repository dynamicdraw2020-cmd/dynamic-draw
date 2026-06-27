import { z } from "zod";
import { databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
const schema = z.object({ profileId: z.uuid(), currencyId: z.uuid(), amount: z.number().int().min(1).max(1_000_000), memo: z.string().trim().max(200).optional().default("") });
export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo; const csrf = enforceSameOrigin(request); if (csrf) return csrf; const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "지급 정보를 확인해 주세요.", 422);
  const meta = requestMeta(request); const admin = createAdminClient(); const { data, error } = await admin.rpc("admin_grant_virtual_currency", { p_currency_id: parsed.data.currencyId, p_profile_id: parsed.data.profileId, p_amount: parsed.data.amount, p_admin_id: guard.auth.userId, p_memo: parsed.data.memo, p_ip: meta.ip, p_user_agent: meta.userAgent });
  if (error) return fail(databaseRpcErrorMessage(error, "화폐를 지급하지 못했습니다."), 409, "CURRENCY_GRANT_FAILED", error.code);
  return ok(data, 201);
}
