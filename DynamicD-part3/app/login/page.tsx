import type { Metadata } from "next";
import { Dices } from "lucide-react";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { demoMode } from "@/lib/env";

export const metadata: Metadata = { title: "로그인" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/account";
  return <main className="auth-shell"><section className="panel form-card auth-card"><div className="auth-logo"><span className="brand-mark"><Dices size={24} /></span></div><h1>𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 로그인</h1><p className="auth-subtitle">승인된 회원은 이벤트 참여 현황과 보유 추첨권을 확인할 수 있습니다.</p>{demoMode && <div className="form-message form-info mb-0">현재는 설정 전 미리보기 모드입니다. Supabase 연결 후 실제 로그인이 작동합니다.</div>}{params.error && <div className="form-message form-error mb-0">계정 상태를 확인해 주세요.</div>}<AuthForm mode="login" nextPath={nextPath} /><p className="auth-switch">비밀번호를 잊었다면 운영자에게 문의해 주세요.</p><p className="auth-switch">아직 신청하지 않았나요? <Link href="/signup">회원가입 신청</Link></p></section></main>;
}
