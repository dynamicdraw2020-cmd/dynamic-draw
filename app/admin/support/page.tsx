import type { Metadata } from "next";
import { AdminSupportManager } from "@/components/support-center";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "문의센터 관리" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const { data: tickets, error } = await admin
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (tickets ?? []) as Array<Record<string, unknown>>;
  const profileIds = Array.from(new Set(rows.map((ticket) => String(ticket.profile_id ?? "")).filter(Boolean)));
  const { data: profiles } = profileIds.length
    ? await admin.from("profiles").select("id,display_name,username,member_code").in("id", profileIds)
    : { data: [] as Array<{ id: string; display_name?: string | null; username?: string | null; member_code?: string | null }> };

  const profileMap = new Map(((profiles ?? []) as Array<{ id: string; display_name?: string | null; username?: string | null; member_code?: string | null }>).map((profile) => [profile.id, profile]));
  const mapped = rows.map((ticket) => ({
    ...ticket,
    category: ticket.category ?? "기타",
    title: ticket.title ?? "문의",
    body: ticket.body ?? "",
    status: ticket.status ?? "OPEN",
    admin_reply: ticket.admin_reply ?? null,
    attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
    profiles: ticket.profile_id ? profileMap.get(String(ticket.profile_id)) ?? null : null,
  }));

  return <main>
    <div className="page-heading">
      <h1>문의센터 관리</h1>
      <p>회원 문의에 답변하고 상태를 관리합니다. 유저 화면에 보이는 문의는 이곳에도 함께 표시됩니다.</p>
      {error && <p className="form-message form-error">문의 목록을 불러오는 중 DB 오류가 발생했습니다: {error.message}</p>}
    </div>
    <AdminSupportManager tickets={mapped as never[]} />
  </main>;
}
