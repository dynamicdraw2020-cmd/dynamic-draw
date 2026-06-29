import type { Metadata } from "next";
import { SupportCenter } from "@/components/support-center";
import { requireApprovedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "문의센터" };
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const profile = await requireApprovedUser();
  const { data } = await createAdminClient().from("support_tickets").select("id,category,title,body,status,admin_reply,answer,internal_memo,created_at,updated_at").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(50);
  return <main className="page"><div className="container"><div className="page-heading"><span className="eyebrow">SUPPORT</span><h1>문의센터</h1><p>지급 오류, 추첨권, 화폐, 계정, 이벤트 문의를 접수할 수 있습니다.</p></div><SupportCenter tickets={data ?? []} /></div></main>;
}
