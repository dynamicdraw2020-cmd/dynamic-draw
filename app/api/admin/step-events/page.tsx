import type { Metadata } from "next";
import { StepEventAdminManager } from "@/components/step-event-admin-manager";
import { requireAdmin } from "@/lib/auth";
import { getAdminStepEventData } from "@/lib/step-events";

export const metadata: Metadata = { title: "스탭업 미션" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 5;

export default async function AdminStepEventsPage() {
  await requireAdmin("MANAGER");
  const data = await getAdminStepEventData();

  return (
    <>
      <div className="page-header">
        <p className="eyebrow">스탭업 미션</p>
        <h1>스탭업 미션 이벤트</h1>
        <p>관리자가 STEP을 자유롭게 추가하고, 유저는 순차적으로 미션을 완료해 보상을 받을 수 있습니다.</p>
      </div>
      <StepEventAdminManager data={data} />
    </>
  );
}
