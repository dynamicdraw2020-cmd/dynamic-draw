import type { Metadata } from "next";
import { Dices } from "lucide-react";
import Link from "next/link";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";

export const metadata: Metadata = { title: "새 비밀번호 설정" };

export default function ResetPasswordPage() {
  return <main className="auth-shell"><section className="panel form-card auth-card"><div className="auth-logo"><span className="brand-mark"><Dices size={24} /></span></div><h1>새 비밀번호 설정</h1><p className="auth-subtitle">이메일의 재설정 링크를 통해 들어온 뒤 새 비밀번호를 저장합니다.</p><PasswordRecoveryForm mode="reset" /><p className="auth-switch">링크가 만료됐나요? <Link href="/forgot-password">새 링크 받기</Link></p></section></main>;
}
