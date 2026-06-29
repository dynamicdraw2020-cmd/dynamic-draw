import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(1500), nickname: z.string().trim().max(30).optional().default("") });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("게시글 내용을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  const { count: tierCount } = await admin.from("member_tiers").select("id", { count: "exact", head: true }).eq("is_active", true);
  if ((tierCount ?? 0) > 0) {
    const { data: tier } = await admin.from("profile_member_tiers").select("member_tiers(can_use_community,is_active)").eq("profile_id", guard.auth.userId).maybeSingle();
    const typedTier = tier as { member_tiers?: { can_use_community?: boolean | null; is_active?: boolean | null } | Array<{ can_use_community?: boolean | null; is_active?: boolean | null }> | null } | null;
    const mt = Array.isArray(typedTier?.member_tiers) ? typedTier?.member_tiers[0] : typedTier?.member_tiers;
    if (!mt?.is_active || !mt?.can_use_community) return fail("커뮤니티 사용 가능 등급이 필요합니다.", 403, "COMMUNITY_TIER_REQUIRED");
  }
  const input = parsed.data;
  const { data, error } = await admin.from("community_posts").insert({ profile_id: guard.auth.userId, title: input.title, body: input.body, nickname: input.nickname || guard.auth.profile.display_name, status: "PUBLISHED" }).select("*").single();
  if (error) return fail("게시글을 등록하지 못했습니다.", 400, "COMMUNITY_POST_FAILED", error.message);
  return ok(data, 201);
}
