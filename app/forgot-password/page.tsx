import type { Metadata } from "next";
import { Dices } from "lucide-react";
import Link from "next/link";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { demoMode } from "@/lib/env";

export const metadata: Metadata = { title: "비밀번호 찾기" };

export default function ForgotPasswordPage() {
  return <main className="auth-shell"><section className="panel form-card auth-card"><div className="auth-logo"><span className="brand-mark"><Dices size={24} /></span></div><h1>비밀번호 찾기</h1><p className="auth-subtitle">가입한 이메일로 안전한 재설정 링크를 보냅니다.</p>{demoMode && <div className="form-message form-info mb-0">미리보기 모드에서는 이메일이 발송되지 않습니다.</div>}<PasswordRecoveryForm mode="request" /><p className="auth-switch"><Link href="/login">로그인으로 돌아가기</Link></p></section></main>;
}
