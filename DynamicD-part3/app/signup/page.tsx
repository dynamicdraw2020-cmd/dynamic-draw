import type { Metadata } from "next";
import { Dices } from "lucide-react";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { demoMode } from "@/lib/env";

export const metadata: Metadata = { title: "회원가입 신청" };

export default function SignupPage() {
  return <main className="auth-shell"><section className="panel form-card auth-card"><div className="auth-logo"><span className="brand-mark"><Dices size={24} /></span></div><h1>회원가입 신청</h1><p className="auth-subtitle">신청서를 보내면 관리자가 확인한 뒤 고유 회원 ID를 발급합니다.</p>{demoMode && <div className="form-message form-info mb-0">미리보기 모드에서는 신청 내용이 저장되지 않습니다. 배포 설정 후 실제로 작동합니다.</div>}<AuthForm mode="signup" /><p className="auth-switch">이미 계정이 있나요? <Link href="/login">로그인</Link></p></section></main>;
}
