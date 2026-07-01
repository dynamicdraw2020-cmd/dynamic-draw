import type { Metadata } from "next";
import { ServerStatusPanel } from "@/components/server-status-panel";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "서버 상태" };
export const dynamic = "force-dynamic";

type InitialData = Parameters<typeof ServerStatusPanel>[0]["initialData"];

async function getInitialStatus(): Promise<InitialData> {
  try {
    // 같은 서버 컴포넌트 안에서 절대 URL을 안정적으로 만들 수 없는 환경이 있어
    // 첫 화면은 클라이언트 패널에서 즉시 재조회하도록 null을 허용합니다.
    return null;
  } catch {
    return null;
  }
}

export default async function AdminServerStatusPage() {
  await requireAdmin("VIEWER");
  const initialData = await getInitialStatus();

  return (
    <>
      <section className="hero-card compact">
        <div>
          <p className="eyebrow">Server Monitor</p>
          <h1>서버 상태</h1>
          <p>앱 ping, DB ping, 주요 테이블 상태, 트래픽 위험도를 한 화면에서 확인합니다.</p>
        </div>
      </section>
      <ServerStatusPanel initialData={initialData} />
    </>
  );
}
