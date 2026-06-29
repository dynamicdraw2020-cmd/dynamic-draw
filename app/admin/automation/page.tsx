import type { Metadata } from "next";
import { AutomationManager } from "@/components/automation-manager";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "자동화" };
export const dynamic = "force-dynamic";

export default async function AdminAutomationPage() {
  await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const [jobs, draws, currencies, rewards, announcements] = await Promise.all([
    admin.from("automation_jobs").select("*").order("created_at", { ascending: false }).limit(120),
    admin.from("draws").select("id,name,status").is("deleted_at", null).order("name", { ascending: true }),
    admin.from("virtual_currencies").select("id,name,symbol").is("deleted_at", null).eq("is_active", true).order("name", { ascending: true }),
    admin.from("rewards").select("id,name").is("deleted_at", null).eq("is_active", true).order("name", { ascending: true }),
    admin.from("special_reward_announcements").select("id,reward_id,title,message,is_active,reward:rewards(name)").order("created_at", { ascending: false }).limit(120),
  ]);
  return <main><div className="page-heading"><h1>자동 추첨·자동 지급</h1><p>예약된 추첨권 지급, 화폐 지급, 추첨 이벤트과 지정 상품 전체공지를 관리합니다.</p></div><AutomationManager jobs={(jobs.data ?? []) as never[]} draws={(draws.data ?? []) as never[]} currencies={(currencies.data ?? []) as never[]} rewards={(rewards.data ?? []) as never[]} announcements={(announcements.data ?? []) as never[]} /></main>;
}
