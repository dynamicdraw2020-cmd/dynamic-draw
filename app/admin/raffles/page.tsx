import type { Metadata } from "next";
import { RaffleManager } from "@/components/claw-raffle-stage";
import { requireAdmin } from "@/lib/auth";
import { getAdminRaffles } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "추첨 이벤트" };
export const dynamic = "force-dynamic";

export default async function AdminRafflesPage() {
  const admin = await requireAdmin("MANAGER");
  const [raffles, tiersResult] = await Promise.all([
    getAdminRaffles(),
    createAdminClient().from("member_tiers").select("id,name,can_use_community,is_active").eq("is_active", true).order("sort_order", { ascending: true }),
  ]);
  return <><div className="admin-toolbar"><div><h1>추첨 이벤트</h1><p className="text-muted">등급 조건을 설정하고 가챠형 연출로 공개 추첨을 진행합니다.</p></div></div><RaffleManager raffles={raffles} adminRole={admin.role} memberTiers={(tiersResult.data ?? []) as never[]} /></>;
}
