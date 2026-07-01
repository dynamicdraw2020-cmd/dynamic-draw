import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiCapability, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
const schema = z.object({
  reason: z.string().trim().max(200).optional().default("관리자 회수"),
});

async function postHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiCapability("SIGNUP_SECRET_CODES");
  if ("error" in guard) return guard.error;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("잘못된 시크릿코드 ID입니다.", 400, "INVALID_SECRET_CODE_ID");

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => ({})));
  if (!parsed.success) return fail("회수 사유를 확인해 주세요.", 422, "VALIDATION_ERROR");

  const admin = createAdminClient();
  const { data: row, error: rowError } = await admin
    .from("signup_secret_codes")
    .select("id,issued_by,used_at,revoked_at,code_label")
    .eq("id", id)
    .maybeSingle();

  if (rowError) return fail("시크릿코드를 확인하지 못했습니다.", 400, "SECRET_CODE_LOOKUP_FAILED", rowError.message);
  if (!row) return fail("시크릿코드를 찾을 수 없습니다.", 404, "SECRET_CODE_NOT_FOUND");
  if (row.used_at) return fail("이미 사용된 코드는 회수할 수 없습니다.", 409, "SECRET_CODE_ALREADY_USED");
  if (row.revoked_at) return fail("이미 회수된 코드입니다.", 409, "SECRET_CODE_ALREADY_REVOKED");

  if (String(guard.auth.profile.role) === "VIEWER" && row.issued_by !== guard.auth.userId) {
    return fail("조회 관리자는 본인이 발급한 코드만 회수할 수 있습니다.", 403, "SECRET_REVOKE_OWN_ONLY");
  }

  const { data, error } = await admin
    .from("signup_secret_codes")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: guard.auth.userId,
      revoke_reason: parsed.data.reason || "관리자 회수",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,code_label,revoked_at,revoked_by,revoke_reason")
    .single();

  if (error) return fail("시크릿코드를 회수하지 못했습니다.", 400, "SECRET_CODE_REVOKE_FAILED", error.message);

  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "SIGNUP_SECRET_CODE_REVOKED",
    p_target_table: "signup_secret_codes",
    p_target_id: id,
    p_details: { codeLabel: row.code_label, reason: parsed.data.reason || "관리자 회수" },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok(data);
}

export const POST = withApiRoute(postHandler, { routeName: "/api/admin/signup-secret-codes/[id]/revoke", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
