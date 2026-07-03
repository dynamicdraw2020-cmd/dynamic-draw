import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ action: z.string().min(1) }).passthrough();

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = bodySchema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const body = parsed.data as Record<string, unknown> & { action: string };
  const admin = createAdminClient();
  if (body.action === "add") {
    const input = z.object({ profileId: z.uuid(), scope: z.enum(["ALL", "DRAW", "EXCHANGE", "COMMUNITY", "LOGIN"]), reason: z.string().trim().min(2).max(1000) }).parse(body);
    const { data, error } = await admin.from("blacklist_entries").insert({ profile_id: input.profileId, scope: input.scope, reason: input.reason, status: "ACTIVE", created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("블랙리스트 등록에 실패했습니다.", 400, "BLACKLIST_ADD_FAILED", error.message);
    return ok(data, 201);
  }
  if (body.action === "remove") {
    const input = z.object({ id: z.uuid() }).parse(body);
    const { error } = await admin.from("blacklist_entries").update({ status: "REMOVED", removed_at: new Date().toISOString(), removed_by: guard.auth.userId }).eq("id", input.id);
    if (error) return fail("블랙리스트 해제에 실패했습니다.", 400, "BLACKLIST_REMOVE_FAILED", error.message);
    return ok({ removed: true });
  }
  return fail("지원하지 않는 블랙리스트 작업입니다.", 404, "UNKNOWN_BLACKLIST_ACTION");
}
