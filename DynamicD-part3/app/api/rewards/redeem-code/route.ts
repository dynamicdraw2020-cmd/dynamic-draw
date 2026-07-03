import { z } from "zod";
import { enforceSameOrigin, fail, ok, readJsonWithLimit, rejectDemoMutation, requestMeta, requireApiUser, withApiRoute } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverRewards, type RewardItem } from "@/lib/reward-engine";
import { normalizeCouponVisibility } from "@/lib/step-event-config";
import { trackStepMission } from "@/lib/step-events";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

const schema = z.object({ code: z.string().trim().min(3).max(40) });

type Promo = {
  id: string;
  code: string;
  name: string;
  code_type: string;
  visibility?: string | null;
  target_mode: string;
  target_profile_id: string | null;
  target_role: string | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  per_user_limit: number;
  used_count: number;
  rewards: RewardItem[];
  is_active: boolean;
  deleted_at?: string | null;
};

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("코드를 입력해 주세요.", 422, "VALIDATION_ERROR", parsed.error.flatten());

  const admin = createAdminClient();
  const code = parsed.data.code.toUpperCase();
  const { data: promo } = await admin.from("promo_codes").select("*").eq("code", code).eq("is_active", true).is("deleted_at", null).maybeSingle();
  if (!promo) return fail("사용 가능한 코드가 아닙니다.", 404, "PROMO_NOT_FOUND");

  const row = promo as Promo;
  const visibility = normalizeCouponVisibility(row.visibility);
  if (visibility === "admin_only") return fail("관리자 지급 전용 쿠폰입니다.", 403, "PROMO_ADMIN_ONLY");
  if (visibility === "event_only") return fail("이벤트 자동 지급 전용 쿠폰입니다.", 403, "PROMO_EVENT_ONLY");

  const now = new Date();
  if (row.starts_at && new Date(row.starts_at) > now) return fail("아직 사용할 수 없는 코드입니다.", 409, "PROMO_NOT_STARTED");
  if (row.ends_at && new Date(row.ends_at) < now) return fail("사용 기간이 종료된 코드입니다.", 409, "PROMO_ENDED");
  if (row.max_uses !== null && row.used_count >= row.max_uses) return fail("전체 사용 가능 횟수를 모두 사용했습니다.", 409, "PROMO_LIMIT_REACHED");
  if (row.target_mode === "PROFILE" && row.target_profile_id !== guard.auth.userId) return fail("이 계정에서 사용할 수 없는 코드입니다.", 403, "PROMO_TARGET_MISMATCH");
  if (row.target_mode === "ROLE" && row.target_role !== guard.auth.profile.role) return fail("현재 권한에서 사용할 수 없는 코드입니다.", 403, "PROMO_ROLE_MISMATCH");

  const { count } = await admin.from("promo_redemptions").select("id", { count: "exact", head: true }).eq("promo_id", row.id).eq("profile_id", guard.auth.userId);
  if ((count ?? 0) >= row.per_user_limit) return fail("이미 사용 가능한 횟수를 모두 사용했습니다.", 409, "PROMO_ALREADY_USED");

  const meta = requestMeta(request);
  const delivered = await deliverRewards({
    admin,
    profileId: guard.auth.userId,
    rewards: row.rewards as RewardItem[],
    sourceType: row.code_type,
    sourceId: row.id,
    createdBy: guard.auth.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    notifyTitle: `${row.name} 보상 지급`,
  });

  const { data: redemption, error } = await admin
    .from("promo_redemptions")
    .insert({ promo_id: row.id, profile_id: guard.auth.userId, reward_snapshot: delivered, ip_address: meta.ip, user_agent: meta.userAgent })
    .select("*")
    .single();
  if (error) return fail("코드 사용 기록을 저장하지 못했습니다.", 400, "PROMO_REDEEM_LOG_FAILED", error.message);

  await Promise.allSettled([
    admin.from("promo_codes").update({ used_count: row.used_count + 1, updated_at: new Date().toISOString() }).eq("id", row.id),
    trackStepMission({
      admin,
      profileId: guard.auth.userId,
      missionType: "COUPON_USE",
      amount: 1,
      sourceType: "PROMO_CODE",
      sourceId: row.id,
      autoClaim: true,
      details: { code: row.code, visibility },
    }),
  ]);

  return ok({ redemption, rewards: delivered }, 201);
}

export const POST = withApiRoute(postHandler, {
  routeName: "/api/rewards/redeem-code",
  rateLimit: { kind: "api", limit: 30, windowSeconds: 60 },
});
