import type { Metadata } from "next";
import { Dices, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { SetupAdminForm } from "@/components/setup-admin-form";
import { adminSetupConfigured, supabaseAdminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "최초 관리자 만들기" };
export const dynamic = "force-dynamic";

export default async function SetupAdminPage() {
  let disabledReason: string | null = null;

  if (!supabaseAdminConfigured) {
    disabledReason = "Supabase 환경변수가 아직 연결되지 않았습니다. Vercel 환경변수부터 확인해 주세요.";
  } else if (!adminSetupConfigured) {
    disabledReason = "ADMIN_SETUP_SECRET 환경변수가 없거나 32자보다 짧습니다. Vercel에서 값을 추가한 뒤 다시 배포해 주세요.";
  } else {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "SUPER_ADMIN");
    if (error) disabledReason = "DB 설치 SQL이 아직 실행되지 않았습니다. 먼저 PASTE_THIS_ONCE.sql을 실행해 주세요.";
    else if ((count ?? 0) > 0) disabledReason = "최초 최고 관리자가 이미 존재합니다. 이 설치 페이지는 더 이상 사용할 수 없습니다.";
  }

  return (
    <main className="auth-shell">
      <section className="panel form-card auth-card">
        <div className="auth-logo"><span className="brand-mark"><Dices size={24} /></span></div>
        <h1>최초 최고 관리자 만들기</h1>
        <p className="auth-subtitle">배포 직후 한 번만 사용합니다. 최고 관리자가 생기면 자동으로 잠깁니다.</p>
        <div className="note-box mb-0"><ShieldCheck size={16} style={{ verticalAlign: -3 }} /> 이 페이지는 일반 회원가입과 다릅니다. 사이트 소유자의 첫 관리자 계정을 만드는 설치 화면입니다.</div>
        <SetupAdminForm disabledReason={disabledReason} />
        <p className="auth-switch"><Link href="/login">로그인 화면으로 돌아가기</Link></p>
      </section>
    </main>
  );
}
