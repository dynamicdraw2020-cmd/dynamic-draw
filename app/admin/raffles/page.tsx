import type { Metadata } from "next";
import { RaffleManager } from "@/components/claw-raffle-stage";
import { requireAdmin } from "@/lib/auth";
import { getAdminRaffles } from "@/lib/data";

export const metadata: Metadata = { title: "전체 회원 추첨" };
export const dynamic = "force-dynamic";

export default async function AdminRafflesPage() {
  await requireAdmin("MANAGER");
  const raffles = await getAdminRaffles();
  return <><div className="admin-toolbar"><div><h1>전체 회원 추첨</h1><p className="text-muted">승인된 전체 회원 중 1명을 인형뽑기식 연출로 추첨합니다.</p></div></div><RaffleManager raffles={raffles} /></>;
}
