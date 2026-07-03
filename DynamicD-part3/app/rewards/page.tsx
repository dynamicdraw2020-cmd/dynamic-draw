import type { Metadata } from "next";
import { RewardCenter } from "@/components/reward-center";
import { requireApprovedUser } from "@/lib/auth";
import { getRewardCenterData } from "@/lib/data";
import { RUNTIME_LIMITS, withTimeout } from "@/lib/ops/runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PromoCode, RewardCenterData } from "@/lib/types";

export const metadata: Metadata = { title: "보상센터" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 5;

type PromoVisibilityRow = {
  id: string;
  visibility: "public" | "hidden" | "admin_only" | "event_only" | null;
};

async function withPublicCouponVisibility(codes: PromoCode[]): Promise<PromoCode[]> {
  if (!codes.length) return [];

  try {
    const admin = createAdminClient();
    const ids = codes.map((code) => code.id).filter(Boolean);
    if (!ids.length) return codes.filter((code) => code.visibility === "public");

    const { data, error } = await withTimeout(
      admin.from("promo_codes").select("id,visibility").in("id", ids),
      RUNTIME_LIMITS.readQueryTimeoutMs,
      "reward center coupon visibility filter",
    );

    if (error || !Array.isArray(data)) {
      return codes.filter((code) => code.visibility === "public");
    }

    const visibilityMap = new Map((data as PromoVisibilityRow[]).map((row) => [row.id, row.visibility ?? "public"]));
    return codes
      .map((code) => ({ ...code, visibility: visibilityMap.get(code.id) ?? code.visibility ?? "public" }))
      .filter((code) => code.visibility === "public");
  } catch {
    return codes.filter((code) => code.visibility === "public");
  }
}

export default async function RewardsPage() {
  const profile = await requireApprovedUser();
  const data = await getRewardCenterData(profile);
  const filteredData: RewardCenterData = {
    ...data,
    availablePromoCodes: await withPublicCouponVisibility(data.availablePromoCodes ?? []),
  };

  return (
    <>
      <div className="page-header">
        <p className="eyebrow">보상센터</p>
        <h1>보상센터</h1>
        <p>출석, 추천, 쿠폰, 랜덤박스 보상을 확인하고 사용할 수 있습니다.</p>
      </div>
      <RewardCenter data={filteredData} />
    </>
  );
}
