import type { Metadata } from "next";
import { CommunityBoard } from "@/components/community-board";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "커뮤니티" };
export const dynamic = "force-dynamic";

type PostRow = { id: string; title: string; body: string; nickname: string | null; created_at: string; community_comments?: Array<{ id: string; body: string; nickname: string | null; created_at: string }> | null };

export default async function CommunityPage() {
  const [profile, postsResult] = await Promise.all([
    getCurrentProfile(),
    createAdminClient().from("community_posts").select("id,title,body,nickname,created_at,community_comments(id,body,nickname,created_at)").eq("status", "PUBLISHED").order("created_at", { ascending: false }).limit(30),
  ]);
  const posts = ((postsResult.data ?? []) as PostRow[]).map((post) => ({ ...post, comments: post.community_comments ?? [] }));
  return <main className="page"><div className="container"><div className="page-heading"><span className="eyebrow">COMMUNITY</span><h1>커뮤니티</h1><p>닉네임으로 소통하는 이벤트 커뮤니티입니다.</p></div><CommunityBoard posts={posts} signedIn={Boolean(profile && profile.status === "APPROVED")} /></div></main>;
}
