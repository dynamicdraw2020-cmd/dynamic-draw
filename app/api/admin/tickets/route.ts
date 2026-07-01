import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiCapability, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";
const schema = z.object({
  drawId: z.uuid(),
  targetMode: z.enum(["ONE", "ALL"]).optional().default("ONE"),
  profileId: z.uuid().optional().nullable(),
  quantity: z.number().int().min(1).max(1000),
  memo: z.string().trim().max(200).optional().nullable(),
});

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiCapability("GRANT_REWARD");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "추첨권 지급 정보를 확인해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());
  if (parsed.data.targetMode === "ONE" && !parsed.data.profileId) return fail("지급할 회원을 선택해 주세요.", 422, "PROFILE_REQUIRED");

  if (String(guard.auth.profile.role) === "CS_MANAGER" && parsed.data.targetMode !== "ONE") {
    return fail("CS매니저는 개별 회원에게만 추첨권을 지급할 수 있습니다.", 403, "CS_MANAGER_GRANT_ONE_ONLY");
  }

  const admin = createAdminClient();
  const meta = requestMeta(request);
  const rpcName = parsed.data.targetMode === "ALL" ? "admin_grant_draw_tickets_bulk" : "admin_grant_draw_tickets";
  const rpcArgs = parsed.data.targetMode === "ALL"
    ? {
        p_draw_id: parsed.data.drawId,
        p_quantity: parsed.data.quantity,
        p_admin_id: guard.auth.userId,
        p_memo: parsed.data.memo ?? "",
        p_ip: meta.ip,
        p_user_agent: meta.userAgent,
      }
    : {
        p_draw_id: parsed.data.drawId,
        p_profile_id: parsed.data.profileId,
        p_quantity: parsed.data.quantity,
        p_admin_id: guard.auth.userId,
        p_memo: parsed.data.memo ?? "",
        p_ip: meta.ip,
        p_user_agent: meta.userAgent,
      };

  const { data, error } = await admin.rpc(rpcName, rpcArgs);
  if (error) return fail(error.message || "추첨권을 지급하지 못했습니다.", 400, "TICKET_GRANT_FAILED", error.code);

  return ok(data, 201);
}

export const POST = withApiRoute(postHandler, { routeName: "/api/admin/tickets", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
