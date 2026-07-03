import { z } from "zod";
import { enforceRateLimit, databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  memberCode: z.string().trim().toUpperCase().regex(/^DD-\d{4}-[A-Z0-9]{4,12}$/, "고유 ID 형식을 확인해 주세요."),
  ruleId: z.uuid(),
  idempotencyKey: z.uuid(),
});

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const limited = await enforceRateLimit(`admin-exchange:${guard.auth.userId}`, 20, 60); if (limited) return limited;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "교환 정보를 확인해 주세요.", 422, "VALIDATION_ERROR");

  const admin = createAdminClient();
  const { data: member, error: memberError } = await admin
    .from("profiles")
    .select("id,display_name,member_code,status,role")
    .eq("member_code", parsed.data.memberCode)
    .maybeSingle();
  if (memberError || !member) return fail("해당 고유 ID의 회원을 찾을 수 없습니다.", 404, "MEMBER_NOT_FOUND");
  if (member.status !== "APPROVED" || member.role !== "USER") return fail("승인된 일반 회원만 교환할 수 있습니다.", 409, "MEMBER_NOT_ELIGIBLE");

  const meta = requestMeta(request);
  const { data, error } = await admin.rpc("exchange_items", {
    p_profile_id: member.id,
    p_rule_id: parsed.data.ruleId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });
  if (error) return fail(databaseRpcErrorMessage(error, "교환 처리에 실패했습니다."), 409, "EXCHANGE_FAILED");

  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "ADMIN_EXCHANGE_EXECUTED",
    p_target_table: "profiles",
    p_target_id: member.id,
    p_details: { memberCode: member.member_code, displayName: member.display_name, ruleId: parsed.data.ruleId, exchange: data },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok({ ...((data ?? {}) as Record<string, unknown>), memberName: member.display_name, memberCode: member.member_code }, 201);
}
