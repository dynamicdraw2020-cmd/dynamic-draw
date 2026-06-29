import type { Metadata } from "next";
import { AdminSupportManager } from "@/components/support-center";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "문의센터 관리" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requireAdmin("MANAGER");
  const { data } = await createAdminClient().from("support_tickets").select("id,category,title,body,status,admin_reply,created_at,updated_at,profiles(display_name,username)").order("created_at", { ascending: false }).limit(120);
  return <main><div className="page-heading"><h1>문의센터 관리</h1><p>회원 문의에 답변하고 상태를 관리합니다.</p></div><AdminSupportManager tickets={(data ?? []) as never[]} /></main>;
}
