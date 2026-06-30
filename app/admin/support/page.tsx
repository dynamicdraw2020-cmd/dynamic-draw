import type { Metadata } from "next";
import { AdminSupportManager } from "@/components/support-center";
import { requireAdminCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "문의센터 관리" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requireAdminCapability("SUPPORT_REPLY");
  const admin = createAdminClient();
  const { data: rpcData } = await admin.rpc("get_admin_support_tickets", { p_limit: 500 });
  let mapped = Array.isArray(rpcData) ? rpcData : [];

  if (!mapped.length) {
    const { data: tickets } = await admin
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

    mapped = rows.map((ticket) => ({
      ...ticket,
      category: ticket.category ?? "기타",
      title: ticket.title ?? "문의",
      body: ticket.body ?? "",
      status: ticket.status ?? "OPEN",
      admin_reply: ticket.admin_reply ?? null,
      attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
      profiles: ticket.profile_id ? profileMap.get(String(ticket.profile_id)) ?? null : null,
    }));
  }

  return (
    <>
      <section className="hero-card compact">
        <div>
          <p className="eyebrow">CS Center</p>
          <h1>문의센터 관리</h1>
          <p>CS매니저와 관리자가 회원 문의에 답변하고 내부 메모를 남깁니다.</p>
        </div>
      </section>
      <AdminSupportManager tickets={mapped} />
    </>
  );
}
