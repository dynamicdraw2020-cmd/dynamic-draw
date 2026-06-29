import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverRewards, type RewardItem } from "@/lib/reward-engine";

const schema = z.object({ code: z.string().trim().min(3).max(40) });

type Promo = { id: string; code: string; name: string; code_type: string; target_mode: string; target_profile_id: string | null; target_role: string | null; starts_at: string | null; ends_at: string | null; max_uses: number | null; per_user_limit: number; used_count: number; rewards: Array<Record<string, unknown>>; is_active: boolean; deleted_at?: string | null };

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("코드를 입력해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  const code = parsed.data.code.toUpperCase();
  const { data: promo } = await admin.from("promo_codes").select("*").eq("code", code).eq("is_active", true).is("deleted_at", null).maybeSingle<Promo>();
  if (!promo) return fail("사용 가능한 코드가 아닙니다.", 404, "PROMO_NOT_FOUND");
  const now = new Date();
  if (promo.starts_at && new Date(promo.starts_at) > now) return fail("아직 사용할 수 없는 코드입니다.", 409, "PROMO_NOT_STARTED");
  if (promo.ends_at && new Date(promo.ends_at) < now) return fail("사용 기간이 종료된 코드입니다.", 409, "PROMO_ENDED");
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) return fail("전체 사용 가능 횟수를 모두 사용했습니다.", 409, "PROMO_LIMIT_REACHED");
  if (promo.target_mode === "PROFILE" && promo.target_profile_id !== guard.auth.userId) return fail("이 계정에서 사용할 수 없는 코드입니다.", 403, "PROMO_TARGET_MISMATCH");
  if (promo.target_mode === "ROLE" && promo.target_role !== guard.auth.profile.role) return fail("현재 권한에서 사용할 수 없는 코드입니다.", 403, "PROMO_ROLE_MISMATCH");
  const { count } = await admin.from("promo_redemptions").select("id", { count: "exact", head: true }).eq("promo_id", promo.id).eq("profile_id", guard.auth.userId);
  if ((count ?? 0) >= promo.per_user_limit) return fail("이미 사용 가능한 횟수를 모두 사용했습니다.", 409, "PROMO_ALREADY_USED");
  const meta = requestMeta(request);
  const delivered = await deliverRewards({ admin, profileId: guard.auth.userId, rewards: promo.rewards as RewardItem[], sourceType: promo.code_type, sourceId: promo.id, createdBy: guard.auth.userId, ip: meta.ip, userAgent: meta.userAgent, notifyTitle: `${promo.name} 보상 지급` });
  const { data: redemption, error } = await admin.from("promo_redemptions").insert({ promo_id: promo.id, profile_id: guard.auth.userId, reward_snapshot: delivered, ip_address: meta.ip, user_agent: meta.userAgent }).select("*").single();
  if (error) return fail("코드 사용 기록을 저장하지 못했습니다.", 400, "PROMO_REDEEM_LOG_FAILED", error.message);
  await admin.from("promo_codes").update({ used_count: promo.used_count + 1, updated_at: new Date().toISOString() }).eq("id", promo.id);
  return ok({ redemption, rewards: delivered }, 201);
}
