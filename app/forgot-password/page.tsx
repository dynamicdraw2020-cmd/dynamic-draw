import type { Metadata } from "next";
import { Dices } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "비밀번호 안내" };

export default function ForgotPasswordPage() {
  return <main className="auth-shell"><section className="panel form-card auth-card"><div className="auth-logo"><span className="brand-mark"><Dices size={24} /></span></div><h1>비밀번호 안내</h1><p className="auth-subtitle">Dynamic Draw는 개인정보 최소 수집을 위해 회원가입 때 이메일과 전화번호를 받지 않습니다.</p><div className="form-message form-info">비밀번호를 잊었다면 운영자에게 아이디와 고유 회원 ID를 알려 주세요. 관리자가 본인 확인 후 새 계정 발급 또는 비밀번호 재설정을 도와줄 수 있습니다.</div><p className="auth-switch"><Link href="/login">로그인으로 돌아가기</Link></p></section></main>;
}
