import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";

export const metadata: Metadata = { title: "비밀번호 변경" };

export default function ChangePasswordPage() {
  return (
    <main className="auth-shell">
      <section className="panel form-card auth-card">
        <div className="auth-logo">
          <span className="brand-mark"><LockKeyhole size={24} /></span>
        </div>
        <h1>비밀번호 변경</h1>
        <p className="auth-subtitle">임시 비밀번호로 로그인했습니다. 계속 이용하려면 새 비밀번호로 변경해 주세요.</p>
        <PasswordRecoveryForm mode="reset" />
      </section>
    </main>
  );
}
