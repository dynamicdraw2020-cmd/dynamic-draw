import type { Metadata } from "next";
import { RaffleManager } from "@/components/claw-raffle-stage";
import { requireAdmin } from "@/lib/auth";
import { getAdminRaffles } from "@/lib/data";

export const metadata: Metadata = { title: "전체 추첨 이벤트" };
export const dynamic = "force-dynamic";

export default async function AdminRafflesPage() {
  const admin = await requireAdmin("MANAGER");
  const raffles = await getAdminRaffles();
  return <><div className="admin-toolbar"><div><h1>전체 회원 추첨</h1><p className="text-muted">전체 유저를 대상으로 공식 추첨을 실행하고 라이브 화면과 연동합니다.</p></div></div><RaffleManager raffles={raffles} adminRole={admin.role} /></>;
}
