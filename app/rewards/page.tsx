import type { Metadata } from "next";
import { RewardCenter } from "@/components/reward-center";
import { requireApprovedUser } from "@/lib/auth";
import { getRewardCenterData } from "@/lib/data";

export const metadata: Metadata = { title: "보상 센터" };
export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const profile = await requireApprovedUser();
  const data = await getRewardCenterData(profile);
  return <main className="page"><div className="container"><div className="page-heading"><h1>보상 센터</h1><p>추천 ID, 출석, 랜덤박스, 쿠폰과 이벤트 코드를 한곳에서 관리합니다.</p></div><RewardCenter data={data} /></div></main>;
}
