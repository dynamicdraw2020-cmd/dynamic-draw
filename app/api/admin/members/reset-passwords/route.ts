import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, readJsonWithLimit, requestMeta, requireApiAdmin, withApiRoute } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEMPORARY_PASSWORD } from "@/lib/password-reset";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const schema = z.object({
  confirm: z.literal("RESET"),
  scope: z.enum(["approved-users", "all-non-deleted"]).optional().default("approved-users"),
  limit: z.number().int().min(1).max(500).optional().default(500),
});

type Target = {
  id: string;
  email: string | null;
  username?: string | null;
  role?: string | null;
  status?: string | null;
};

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiAdmin("SUPER_ADMIN");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("일괄 초기화를 진행하려면 RESET 확인값이 필요합니다.", 422, "VALIDATION_ERROR");

  const admin = createAdminClient();
  let query = admin
    .from("profiles")
    .select("id,email,username,role,status")
    .neq("id", guard.auth.userId)
    .neq("role", "SUPER_ADMIN")
    .limit(parsed.data.limit);

  if (parsed.data.scope === "approved-users") query = query.eq("status", "APPROVED");
  else query = query.neq("status", "DELETED");

  const { data: targets, error: listError } = await query;
  if (listError) return fail("초기화 대상 회원 목록을 불러오지 못했습니다.", 400, "TARGET_LIST_FAILED", listError.message);

  const succeeded: Target[] = [];
  const failed: Array<Target & { reason: string }> = [];

  for (const target of (targets ?? []) as Target[]) {
    try {
      const { error } = await admin.auth.admin.updateUserById(target.id, { password: TEMPORARY_PASSWORD });
      if (error) {
        failed.push({ ...target, reason: error.message });
        continue;
      }
      succeeded.push(target);
    } catch (error) {
      failed.push({ ...target, reason: error instanceof Error ? error.message : "unknown" });
    }
  }

  if (succeeded.length) {
    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("profiles")
      .update({ must_change_password: true, password_reset_at: now, password_changed_at: null })
      .in("id", succeeded.map((target) => target.id));
    if (updateError) return fail("Auth 비밀번호는 초기화됐지만 profiles 상태 업데이트에 실패했습니다.", 500, "PROFILE_FLAGS_FAILED", updateError.message);
  }

  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "MEMBER_PASSWORD_BULK_RESET",
    p_target_table: "profiles",
    p_target_id: guard.auth.userId,
    p_details: {
      scope: parsed.data.scope,
      requestedLimit: parsed.data.limit,
      succeededCount: succeeded.length,
      failedCount: failed.length,
      failed: failed.slice(0, 20).map((item) => ({ id: item.id, email: item.email, username: item.username, reason: item.reason })),
    },
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok({
    temporaryPassword: TEMPORARY_PASSWORD,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    failed: failed.slice(0, 50),
  });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/admin/members/reset-passwords", rateLimit: { kind: "admin", limit: 5, windowSeconds: 60 } });
