import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ body: z.string().trim().min(1).max(500), nickname: z.string().trim().max(30).optional().default("") });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("게시글 ID가 올바르지 않습니다.", 400, "INVALID_POST_ID");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("댓글 내용을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const { data, error } = await createAdminClient().from("community_comments").insert({ post_id: id, profile_id: guard.auth.userId, body: parsed.data.body, nickname: parsed.data.nickname || guard.auth.profile.display_name }).select("*").single();
  if (error) return fail("댓글을 등록하지 못했습니다.", 400, "COMMUNITY_COMMENT_FAILED", error.message);
  return ok(data, 201);
}
