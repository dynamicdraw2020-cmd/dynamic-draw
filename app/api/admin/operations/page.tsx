import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { OperationStatsPanel } from "@/components/operation-stats-panel";

export const metadata: Metadata = { title: "운영 통계" };
export const dynamic = "force-dynamic";

export default async function AdminOperationsPage() {
  await requireAdmin("VIEWER");
  const admin = createAdminClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = `${today}T00:00:00+09:00`;
  const [members, pending, results, tickets, currencyLogs, exchanges, attendances, blacklists, inquiries] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "APPROVED"),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    admin.from("results").select("id", { count: "exact", head: true }).gte("created_at", start),
    admin.from("draw_tickets").select("quantity"),
    admin.from("currency_logs").select("id", { count: "exact", head: true }).gte("created_at", start),
    admin.from("exchange_logs").select("id", { count: "exact", head: true }).gte("created_at", start),
    admin.from("attendance_logs").select("id", { count: "exact", head: true }).eq("attendance_date", today),
    admin.from("blacklist_entries").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "OPEN"),
  ]);
  const totalTickets = ((tickets.data ?? []) as Array<{ quantity: number }>).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  return <main><div className="page-heading"><h1>운영 통계</h1><p>회원, 지급, 출석, 교환, 제한 현황을 운영 기준으로 확인합니다.</p></div><OperationStatsPanel stats={{ approvedMembers: members.count ?? 0, pendingMembers: pending.count ?? 0, todayDraws: results.count ?? 0, totalTickets, todayCurrencyLogs: currencyLogs.count ?? 0, todayExchanges: exchanges.count ?? 0, todayAttendance: attendances.count ?? 0, activeBlacklists: blacklists.count ?? 0, openInquiries: inquiries.count ?? 0 }} /></main>;
}
