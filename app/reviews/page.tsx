import type { Metadata } from "next";
import { WinnerReviewBoard } from "@/components/review-board";
import { requireApprovedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "당첨 후기" };
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const profile = await requireApprovedUser();
  const admin = createAdminClient();
  const [reviews, results] = await Promise.all([
    admin.from("winner_reviews").select("id,title,body,nickname,status,is_featured,created_at,reward_name").eq("status", "APPROVED").order("created_at", { ascending: false }).limit(50),
    admin.from("results").select("id,draws(name),rewards(name)").eq("participant_id", profile.id).not("revealed_at", "is", null).is("voided_at", null).order("created_at", { ascending: false }).limit(50),
  ]);
  const resultOptions = ((results.data ?? []) as Array<{ id: string; draws?: { name?: string } | Array<{ name?: string }>; rewards?: { name?: string } | Array<{ name?: string }> }>).map((row) => { const draw = Array.isArray(row.draws) ? row.draws[0] : row.draws; const reward = Array.isArray(row.rewards) ? row.rewards[0] : row.rewards; return { id: row.id, draw_name: draw?.name ?? null, reward_name: reward?.name ?? null }; });
  return <main className="page"><div className="container"><div className="page-heading"><span className="eyebrow">WINNER REVIEW</span><h1>당첨 후기</h1><p>당첨 경험을 공유하고 공개 후기를 확인합니다.</p></div><WinnerReviewBoard reviews={(reviews.data ?? []) as never[]} results={resultOptions} /></div></main>;
}
