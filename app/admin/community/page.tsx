import type { Metadata } from "next";
import { AdminCommunityManager } from "@/components/community-board";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "커뮤니티 관리" };
export const dynamic = "force-dynamic";

type PostRow = { id: string; title: string; body: string; nickname: string | null; status: string; created_at: string; community_reports?: Array<{ id: string; reason?: string | null }> | null };

export default async function AdminCommunityPage() {
  await requireAdmin("MANAGER");
  const { data } = await createAdminClient().from("community_posts").select("id,title,body,nickname,status,created_at,community_reports(id,reason)").order("created_at", { ascending: false }).limit(100);
  const posts = ((data ?? []) as PostRow[]).map((post) => ({ ...post, report_count: post.community_reports?.length ?? 0 }));
  return <main><div className="page-heading"><h1>커뮤니티 관리</h1><p>게시글과 신고 내역을 관리합니다.</p></div><AdminCommunityManager posts={posts} /></main>;
}
