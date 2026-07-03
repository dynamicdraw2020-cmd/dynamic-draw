import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ action: z.enum(["delete-post", "restore-post"]), id: z.uuid() });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  const status = parsed.data.action === "delete-post" ? "DELETED" : "PUBLISHED";
  const { error } = await admin.from("community_posts").update({ status, moderated_by: guard.auth.userId, moderated_at: new Date().toISOString() }).eq("id", parsed.data.id);
  if (error) return fail("커뮤니티 글을 처리하지 못했습니다.", 400, "COMMUNITY_ADMIN_FAILED", error.message);
  return ok({ id: parsed.data.id, status });
}
