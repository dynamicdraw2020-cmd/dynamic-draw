import type { Metadata } from "next";
import { Dices, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { SetupAdminForm } from "@/components/setup-admin-form";
import { inspectSetupStatus } from "@/lib/setup-status";

export const metadata: Metadata = { title: "최초 관리자 만들기" };
export const dynamic = "force-dynamic";

export default async function SetupAdminPage() {
  const status = await inspectSetupStatus();
  const disabledReason = status.ready ? null : status.message;

  return (
    <main className="auth-shell">
      <section className="panel form-card auth-card">
        <div className="auth-logo"><span className="brand-mark"><Dices size={24} /></span></div>
        <h1>최초 최고 관리자 만들기</h1>
        <p className="auth-subtitle">배포 직후 한 번만 사용합니다. 최고 관리자가 생기면 자동으로 잠깁니다.</p>
        <div className="note-box mb-0"><ShieldCheck size={16} style={{ verticalAlign: -3 }} /> 이 페이지는 일반 회원가입과 다릅니다. 사이트 소유자의 첫 관리자 계정을 만드는 설치 화면입니다.</div>
        {status.technicalCode && (
          <p className="text-muted text-small" style={{ marginBottom: 0 }}>
            진단 코드: {status.code} / {status.technicalCode}
          </p>
        )}
        <SetupAdminForm disabledReason={disabledReason} />
        <p className="auth-switch"><Link href="/login">로그인 화면으로 돌아가기</Link></p>
      </section>
    </main>
  );
}
