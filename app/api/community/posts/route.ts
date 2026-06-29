import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(1500), nickname: z.string().trim().max(30).optional().default("") });

async function canUseCommunity(admin: ReturnType<typeof createAdminClient>, profileId: string) {
  const { data: tierRows } = await admin.from("member_tiers").select("id").eq("can_use_community", true);
  const tierIds = (tierRows ?? []).map((row) => row.id);
  if (!tierIds.length) return true;
  const { count } = await admin.from("profile_member_tiers").select("tier_id", { count: "exact", head: true }).eq("profile_id", profileId).in("tier_id", tierIds);
  return (count ?? 0) > 0;
}

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("게시글 내용을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  if (!(await canUseCommunity(admin, guard.auth.userId))) return fail("커뮤니티 이용 가능 등급이 필요합니다.", 403, "COMMUNITY_TIER_REQUIRED");
  const input = parsed.data;
  const { data, error } = await admin.from("community_posts").insert({ profile_id: guard.auth.userId, title: input.title, body: input.body, nickname: input.nickname || guard.auth.profile.display_name, status: "PUBLISHED" }).select("*").single();
  if (error) return fail("게시글을 등록하지 못했습니다.", 400, "COMMUNITY_POST_FAILED", error.message);
  return ok(data, 201);
}
