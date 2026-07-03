import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { getCurrentProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "비밀번호 변경" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/change-password");

  return (
    <main className="auth-shell">
      <section className="panel form-card auth-card">
        <div className="auth-logo"><span className="brand-mark"><LockKeyhole size={24} /></span></div>
        <h1>비밀번호 변경</h1>
        <p className="auth-subtitle">
          임시 비밀번호로 로그인한 계정은 새 비밀번호로 변경해야 계속 이용할 수 있습니다.
        </p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
