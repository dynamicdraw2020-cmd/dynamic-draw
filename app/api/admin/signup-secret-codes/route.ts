import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiCapability } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  quantity: z.number().int().min(1).max(20).optional().default(1),
  note: z.string().trim().max(120).optional().default(""),
});

type SecretRow = {
  id: string;
  code_label: string;
  issued_by: string | null;
  issued_to_note: string | null;
  expires_at: string;
  used_by: string | null;
  used_login_id: string | null;
  used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_at: string;
};

export async function GET() {
  const guard = await requireApiCapability("SIGNUP_SECRET_CODES");
  if ("error" in guard) return guard.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("signup_secret_codes")
    .select("id,code_label,issued_by,issued_to_note,expires_at,used_by,used_login_id,used_at,revoked_at,revoked_by,revoke_reason,created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return fail("시크릿코드 목록을 불러오지 못했습니다. SQL 보정 파일 적용 여부를 확인해 주세요.", 500, "SECRET_CODE_LIST_FAILED", error.message);

  return ok({ codes: (data ?? []) as SecretRow[] });
}

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiCapability("SIGNUP_SECRET_CODES");
  if ("error" in guard) return guard.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("발급 수량과 메모를 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());

  const admin = createAdminClient();
  const issued: unknown[] = [];

  for (let i = 0; i < parsed.data.quantity; i += 1) {
    const { data, error } = await admin.rpc("generate_signup_secret_code", {
      p_admin_id: guard.auth.userId,
      p_note: parsed.data.note || null,
    });

    if (error) return fail(error.message || "시크릿코드를 발급하지 못했습니다.", 400, "SECRET_CODE_CREATE_FAILED", error.code);
    issued.push(data);
  }

  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "SIGNUP_SECRET_CODES_ISSUED",
    p_target_table: "signup_secret_codes",
    p_target_id: guard.auth.userId,
    p_details: { quantity: issued.length, note: parsed.data.note || null },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok({ issued }, 201);
}
