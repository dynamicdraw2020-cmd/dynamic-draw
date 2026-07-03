import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiUser, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ reason: z.string().trim().min(2).max(300) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("게시글 ID가 올바르지 않습니다.", 400, "INVALID_POST_ID");
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("신고 사유를 입력해 주세요.", 422, "VALIDATION_ERROR");
  const { data, error } = await createAdminClient().from("community_reports").insert({ post_id: id, reporter_id: guard.auth.userId, reason: parsed.data.reason }).select("*").single();
  if (error) return fail("신고를 접수하지 못했습니다.", 400, "COMMUNITY_REPORT_FAILED", error.message);
  return ok(data, 201);
}
