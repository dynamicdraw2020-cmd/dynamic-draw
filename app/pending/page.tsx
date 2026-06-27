import type { Metadata } from "next";
import { Clock3 } from "lucide-react";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "승인 대기" };
export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const profile = await getCurrentProfile();
  return <main className="auth-shell"><section className="panel form-card auth-card"><div className="auth-logo"><span className="brand-mark"><Clock3 size={24} /></span></div><h1>관리자 승인 대기 중</h1><p className="auth-subtitle">{profile?.display_name ?? "회원"}님의 신청이 접수되었습니다. 관리자가 승인하면 고유 ID가 발급됩니다.</p><div className="note-box">개인정보 최소 수집 원칙에 따라 이메일·전화번호 없이 아이디 기반으로 승인 대기합니다.</div><Link className="btn btn-secondary btn-block mt-3" href="/">홈으로 돌아가기</Link></section></main>;
}
