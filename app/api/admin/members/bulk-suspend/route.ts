import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ reason: z.string().trim().min(2).max(300) });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("SUPER_ADMIN"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("이용정지 사유를 입력해 주세요.", 422, "VALIDATION_ERROR");

  const admin = createAdminClient();
  const meta = requestMeta(request);
  const before = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "USER").eq("status", "APPROVED");
  const { data, error } = await admin
    .from("profiles")
    .update({ status: "SUSPENDED", rejection_reason: parsed.data.reason, updated_at: new Date().toISOString() })
    .eq("role", "USER")
    .eq("status", "APPROVED")
    .select("id");
  if (error) return fail("일반 회원 전체 이용정지를 처리하지 못했습니다.", 400, "BULK_SUSPEND_FAILED", error.message);

  const affected = (data ?? []).length || before.count || 0;
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "MEMBERS_BULK_SUSPENDED",
    p_target_table: "profiles",
    p_target_id: guard.auth.userId,
    p_details: { affectedCount: affected, reason: parsed.data.reason, excludeAdmins: true },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });
  return ok({ suspendedCount: affected });
}
