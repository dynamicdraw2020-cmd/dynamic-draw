import type { Metadata } from "next";
import { StepEventUserCenter } from "@/components/step-event-user-center";
import { requireApprovedUser } from "@/lib/auth";
import { getUserStepEvents } from "@/lib/step-events";

export const metadata: Metadata = { title: "스탭업 미션" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 5;

export default async function StepEventsPage() {
  const profile = await requireApprovedUser();
  const events = await getUserStepEvents(profile.id);

  return (
    <>
      <div className="page-header">
        <p className="eyebrow">스탭업 미션</p>
        <h1>스탭업 미션</h1>
        <p>열려 있는 STEP을 순서대로 완료하고 보상을 받아보세요.</p>
      </div>
      <StepEventUserCenter events={events} />
    </>
  );
}
