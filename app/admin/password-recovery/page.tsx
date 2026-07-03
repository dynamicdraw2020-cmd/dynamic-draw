import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { PasswordRecoveryPanel } from "@/components/password-recovery-panel";

export const metadata: Metadata = { title: "비밀번호 복구" };
export const dynamic = "force-dynamic";

export default async function AdminPasswordRecoveryPage() {
  await requireAdmin("SUPER_ADMIN");
  return (
    <main>
      <div className="page-heading">
        <h1>비밀번호 복구</h1>
        <p>복구된 회원들의 비밀번호를 공통 임시 비밀번호로 초기화하고 첫 로그인 시 변경을 강제합니다.</p>
      </div>
      <PasswordRecoveryPanel />
    </main>
  );
}
