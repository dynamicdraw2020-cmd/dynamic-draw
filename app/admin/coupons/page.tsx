import type { Metadata } from "next";
import { CouponVisibilityManager } from "@/components/coupon-visibility-manager";
import { requireAdmin } from "@/lib/auth";
import { getAdminCouponVisibilityData } from "@/lib/coupon-visibility";

export const metadata: Metadata = { title: "쿠폰 공개 설정" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 5;

export default async function AdminCouponsPage() {
  await requireAdmin("MANAGER");
  const data = await getAdminCouponVisibilityData();

  return (
    <>
      <div className="page-header">
        <p className="eyebrow">쿠폰 관리</p>
        <h1>쿠폰 공개 설정</h1>
        <p>공개, 숨김, 관리자 전용, 이벤트 전용 쿠폰을 생성하고 언제든 공개 상태를 변경합니다.</p>
      </div>
      <CouponVisibilityManager data={data} />
    </>
  );
}
