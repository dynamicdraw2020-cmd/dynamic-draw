import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiCapability, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
const schema = z.object({
  targetMode: z.enum(["ONE", "ALL"]).optional().default("ONE"),
  profileId: z.uuid().optional().nullable(),
  currencyId: z.uuid(),
  amount: z.number().int().min(1).max(1_000_000),
  memo: z.string().trim().max(200).optional().default(""),
});

type ApprovedProfile = { id: string; display_name: string; role: string; status: string };
type CurrencyRow = { id: string; name: string; symbol: string; code: string; is_active: boolean; deleted_at?: string | null };
type BalanceRow = { profile_id: string; currency_id: string; balance: number };

function asErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === "object" && error !== null && "message" in error) return String((error as { message?: unknown }).message ?? fallback);
  return fallback;
}

async function insertCurrencyLog(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    profileId: string;
    currencyId: string;
    amount: number;
    action: string;
    memo: string;
    balanceAfter: number;
    createdBy: string;
    ip: string;
    userAgent: string;
  },
) {
  await admin.from("currency_logs").insert({
    profile_id: input.profileId,
    currency_id: input.currencyId,
    amount: input.amount,
    action: input.action,
    memo: input.memo,
    balance_after: input.balanceAfter,
    created_by: input.createdBy,
    ip_address: input.ip,
    user_agent: input.userAgent,
  });
}

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiCapability("GRANT_REWARD");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "지급 정보를 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());
  if (parsed.data.targetMode === "ONE" && !parsed.data.profileId) return fail("지급할 회원을 선택해 주세요.", 422, "PROFILE_REQUIRED");

  if (String(guard.auth.profile.role) === "CS_MANAGER" && parsed.data.targetMode !== "ONE") {
    return fail("CS매니저는 개별 회원에게만 포인트를 지급할 수 있습니다.", 403, "CS_MANAGER_GRANT_ONE_ONLY");
  }

  const admin = createAdminClient();
  const meta = requestMeta(request);

  const { data: currency, error: currencyError } = await admin
    .from("virtual_currencies")
    .select("id,name,code,symbol,is_active,deleted_at")
    .eq("id", parsed.data.currencyId)
    .maybeSingle();

  if (currencyError) return fail("화폐 정보를 확인하지 못했습니다.", 400, "CURRENCY_LOOKUP_FAILED", asErrorMessage(currencyError, "lookup failed"));
  if (!currency) return fail("선택한 화폐가 존재하지 않습니다.\n화면을 새로고침한 뒤 다시 선택해 주세요.", 404, "CURRENCY_NOT_FOUND");
  if (!currency.is_active || currency.deleted_at) return fail("정지 또는 삭제된 화폐입니다.\n화폐를 복구하거나 다른 화폐를 선택해 주세요.", 409, "CURRENCY_NOT_AVAILABLE");

  const targetQuery = admin.from("profiles").select("id,display_name,role,status").eq("status", "APPROVED");
  const { data: targets, error: targetError } = parsed.data.targetMode === "ALL" ? await targetQuery : await targetQuery.eq("id", parsed.data.profileId ?? "");

  if (targetError) return fail("지급 대상 계정을 확인하지 못했습니다.", 400, "TARGET_LOOKUP_FAILED", asErrorMessage(targetError, "target lookup failed"));

  const approvedTargets = ((targets ?? []) as ApprovedProfile[]).filter((target) => target.status === "APPROVED");
  if (!approvedTargets.length) {
    return fail(parsed.data.targetMode === "ALL" ? "지급할 승인 계정이 없습니다." : "승인된 지급 대상 계정을 찾을 수 없습니다.", 404, "TARGET_NOT_FOUND");
  }

  let affectedCount = 0;
  let lastBalance = 0;

  for (const target of approvedTargets) {
    const { data: before } = await admin
      .from("currency_balances")
      .select("profile_id,currency_id,balance")
      .eq("profile_id", target.id)
      .eq("currency_id", currency.id)
      .maybeSingle();

    const beforeBalance = Number(before?.balance ?? 0);
    const nextBalance = beforeBalance + parsed.data.amount;

    const { error: balanceError } = await admin
      .from("currency_balances")
      .upsert(
        { profile_id: target.id, currency_id: currency.id, balance: nextBalance, updated_at: new Date().toISOString() },
        { onConflict: "profile_id,currency_id" },
      );

    if (balanceError) return fail("화폐 잔액을 지급하지 못했습니다.", 400, "CURRENCY_BALANCE_FAILED", asErrorMessage(balanceError, "balance failed"));

    await insertCurrencyLog(admin, {
      profileId: target.id,
      currencyId: currency.id,
      amount: parsed.data.amount,
      action: parsed.data.targetMode === "ALL" ? "ADMIN_BULK_GRANT" : "ADMIN_GRANT",
      memo: parsed.data.memo,
      balanceAfter: nextBalance,
      createdBy: guard.auth.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    affectedCount += 1;
    lastBalance = nextBalance;
  }

  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: parsed.data.targetMode === "ALL" ? "VIRTUAL_CURRENCY_BULK_GRANTED" : "VIRTUAL_CURRENCY_GRANTED",
    p_target_table: "currency_balances",
    p_target_id: parsed.data.targetMode === "ALL" ? currency.id : approvedTargets[0]?.id,
    p_details: {
      currencyId: currency.id,
      currencyName: currency.name,
      amountAdded: parsed.data.amount,
      affectedCount,
      targetMode: parsed.data.targetMode,
      memo: parsed.data.memo,
      operatedByRole: guard.auth.profile.role,
    },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok(
    parsed.data.targetMode === "ALL"
      ? { currencyId: currency.id, currencyName: currency.name, amountAddedEach: parsed.data.amount, affectedCount }
      : { profileId: approvedTargets[0]?.id, currencyId: currency.id, currencyName: currency.name, amountAdded: parsed.data.amount, balance: lastBalance },
    201,
  );
}

export const POST = withApiRoute(postHandler, { routeName: "/api/admin/currency-grants", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
