import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiUser, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ resultId: z.string().optional().nullable(), title: z.string().trim().min(2).max(100), body: z.string().trim().min(5).max(1600), nickname: z.string().trim().max(30).optional().default("") });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("후기 내용을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  let rewardName: string | null = null;
  if (parsed.data.resultId && z.uuid().safeParse(parsed.data.resultId).success) {
    const { data: result } = await admin.from("results").select("id,participant_id,rewards(name)").eq("id", parsed.data.resultId).maybeSingle();
    if (result && result.participant_id === guard.auth.userId) {
      const rewards = result.rewards as { name?: string } | Array<{ name?: string }> | null;
      rewardName = (Array.isArray(rewards) ? rewards[0]?.name : rewards?.name) ?? null;
    }
  }
  const { data, error } = await admin.from("winner_reviews").insert({ profile_id: guard.auth.userId, result_id: parsed.data.resultId || null, title: parsed.data.title, body: parsed.data.body, nickname: parsed.data.nickname || guard.auth.profile.display_name, reward_name: rewardName }).select("*").single();
  if (error) return fail("후기를 접수하지 못했습니다.", 400, "REVIEW_CREATE_FAILED", error.message);
  return ok(data, 201);
}
