import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ reason: z.string().trim().min(2).max(300).optional().default("전체 이용정지 해지") });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("SUPER_ADMIN"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");

  const admin = createAdminClient();
  const meta = requestMeta(request);
  const before = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "USER").eq("status", "SUSPENDED");
  const { data, error } = await admin
    .from("profiles")
    .update({ status: "APPROVED", rejection_reason: null, updated_at: new Date().toISOString() })
    .eq("role", "USER")
    .eq("status", "SUSPENDED")
    .select("id");
  if (error) return fail("일반 회원 전체 이용정지 해지를 처리하지 못했습니다.", 400, "BULK_RESTORE_FAILED", error.message);

  const affected = (data ?? []).length || before.count || 0;
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "MEMBERS_BULK_RESTORED",
    p_target_table: "profiles",
    p_target_id: guard.auth.userId,
    p_details: { affectedCount: affected, reason: parsed.data.reason, onlyRegularUsers: true },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });
  return ok({ restoredCount: affected });
}
