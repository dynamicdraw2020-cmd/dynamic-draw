import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  operationMode: z.enum(["ACTIVE", "UPDATING", "INACTIVE"]),
  operationMessage: z.string().trim().max(500).optional().default(""),
  operationEndsAt: z.string().trim().max(80).optional().default(""),
});

export async function PATCH(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("SUPER_ADMIN"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("운영 모드 값을 확인해 주세요.", 422, "VALIDATION_ERROR");

  const admin = createAdminClient();
  const meta = requestMeta(request);
  const forceLogoutAt = parsed.data.operationMode === "ACTIVE" ? "" : new Date().toISOString();

  const { data: rpcData, error: rpcError } = await admin.rpc("set_operation_mode", {
    p_mode: parsed.data.operationMode,
    p_message: parsed.data.operationMessage,
    p_ends_at: parsed.data.operationEndsAt,
    p_actor_id: guard.auth.userId,
  });

  if (!rpcError) return ok(rpcData ?? { ...parsed.data, forceLogoutAt });

  const rows = [
    { key: "operation_mode", value: parsed.data.operationMode, is_public: true, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
    { key: "operation_message", value: parsed.data.operationMessage, is_public: true, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
    { key: "operation_ends_at", value: parsed.data.operationEndsAt, is_public: true, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
    { key: "operation_force_logout_at", value: forceLogoutAt, is_public: true, updated_by: guard.auth.userId, updated_at: new Date().toISOString() },
  ];
  const { error } = await admin.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) return fail("운영 모드를 저장하지 못했습니다.", 400, "OPERATION_MODE_SAVE_FAILED", { rpc: rpcError.message, direct: error.message });

  await admin.rpc("append_admin_log", {
    p_admin_id: guard.auth.userId,
    p_action: "OPERATION_MODE_UPDATED",
    p_target_table: "site_settings",
    p_target_id: null,
    p_details: parsed.data,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

  return ok({ ...parsed.data, forceLogoutAt });
}
