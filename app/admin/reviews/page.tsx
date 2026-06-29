import type { Metadata } from "next";
import { AdminReviewManager } from "@/components/review-board";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "당첨 후기 관리" };
export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  await requireAdmin("MANAGER");
  const { data } = await createAdminClient().from("winner_reviews").select("id,title,body,nickname,status,is_featured,created_at,reward_name").order("created_at", { ascending: false }).limit(120);
  return <main><div className="page-heading"><h1>당첨 후기 관리</h1><p>후기 승인과 메인 노출을 관리합니다.</p></div><AdminReviewManager reviews={(data ?? []) as never[]} /></main>;
}
