import type { Metadata } from "next";
import { TicketGrantManager } from "@/components/ticket-grant-manager";
import { requireAdmin } from "@/lib/auth";
import { getAdminDraws, getAdminMembers, getAdminTicketBalances } from "@/lib/data";

export const metadata: Metadata = { title: "추첨권 지급" };
export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  await requireAdmin("MANAGER");
  const [draws, members, balances] = await Promise.all([getAdminDraws(), getAdminMembers(), getAdminTicketBalances()]);
  return <><div className="admin-toolbar"><div><h1>추첨권 지급</h1><p className="text-muted">회원에게 뽑기별 추첨권을 넣어주고 직접 룰렛 참여를 허용합니다.</p></div></div><TicketGrantManager draws={draws} members={members} balances={balances} /></>;
}
