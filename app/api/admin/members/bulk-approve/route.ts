import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiCapability, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApprovalRewards } from "@/lib/reward-engine";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
const schema = z.object({ memberIds: z.array(z.uuid()).min(1).max(300) });

type AdminClient = ReturnType<typeof createAdminClient>;

async function nextMemberCode(admin: AdminClient) {
  const { data, error } = await admin.rpc("next_member_code");
  if (error || typeof data !== "string") throw new Error(error?.message ?? "고유 ID를 생성하지 못했습니다.");
  return data;
}

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiCapability("MEMBER_STATUS");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("승인할 회원을 선택해 주세요.", 422, "VALIDATION_ERROR");

  const ids = Array.from(new Set(parsed.data.memberIds));
  const admin = createAdminClient();
  const { data: targets, error: targetError } = await admin.from("profiles").select("id,email,username,display_name,member_code,role,status").in("id", ids);

  if (targetError) return fail("회원 목록을 확인하지 못했습니다.", 400, "MEMBER_FETCH_FAILED", targetError.message);

  const pending = (targets ?? []).filter((profile) => profile.status === "PENDING" && profile.role === "USER");
  if (!pending.length) return fail("승인 가능한 대기 회원이 없습니다.", 409, "NO_PENDING_MEMBERS");

  const meta = requestMeta(request);
  const approved: Array<{ id: string; member_code: string }> = [];

  for (const profile of pending) {
    const code = profile.member_code ?? (await nextMemberCode(admin));
    const { data, error } = await admin
      .from("profiles")
      .update({
        status: "APPROVED",
        member_code: code,
        approved_by: guard.auth.userId,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", profile.id)
      .eq("status", "PENDING")
      .eq("role", "USER")
      .select("id,member_code")
      .maybeSingle();

    if (!error && data) {
      approved.push({ id: data.id, member_code: data.member_code });
      await handleApprovalRewards(admin, profile.id, guard.auth.userId);
      await admin.rpc("append_admin_log", {
        p_admin_id: guard.auth.userId,
        p_action: "MEMBER_BULK_APPROVED",
        p_target_table: "profiles",
        p_target_id: profile.id,
        p_details: { before: profile, after: data, operatedByRole: guard.auth.profile.role },
        p_ip: meta.ip,
        p_user_agent: meta.userAgent,
      });
    }
  }

  return ok({ approvedCount: approved.length, approved });
}

export const POST = withApiRoute(postHandler, { routeName: "/api/admin/members/bulk-approve", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
