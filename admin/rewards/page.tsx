import type { Metadata } from "next";
import { RewardSystemManager } from "@/components/reward-system-manager";
import { requireAdmin } from "@/lib/auth";
import { getRewardSystemAdminData } from "@/lib/data";

export const metadata: Metadata = { title: "추천·보상" };
export const dynamic = "force-dynamic";

export default async function AdminRewardsPage() {
  await requireAdmin("MANAGER");
  const data = await getRewardSystemAdminData();
  return <><div className="admin-toolbar"><div><h1>추천·보상 시스템</h1><p className="text-muted">추천인, 가입 랜덤박스, 출석, 쿠폰, 이벤트 코드, 알림센터 보상을 설정합니다.</p></div></div><RewardSystemManager data={data} /></>;
}
