import type { Metadata } from "next";
import { AdminSupportManager } from "@/components/support-center";
import { requireAdminCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeRows, safeQuery } from "@/lib/ops/safe-query";

export const metadata: Metadata = { title: "문의센터 관리" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requireAdminCapability("SUPPORT_REPLY");
  const admin = createAdminClient();
  const rpcData = await safeQuery<unknown>(admin.rpc("get_admin_support_tickets", { p_limit: 500 }), { label: "admin support rpc", fallback: [] });
  let mapped = Array.isArray(rpcData) ? rpcData : [];

  if (!mapped.length) {
    const rows = await safeRows<Record<string, unknown>>(
      admin
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      "admin support tickets fallback",
    );
    const profileIds = Array.from(new Set(rows.map((ticket) => String(ticket.profile_id ?? "")).filter(Boolean)));
    const profiles = profileIds.length
      ? await safeRows<{ id: string; display_name?: string | null; username?: string | null; member_code?: string | null }>(
          admin.from("profiles").select("id,display_name,username,member_code").in("id", profileIds),
          "admin support profiles fallback",
        )
      : ([] as Array<{ id: string; display_name?: string | null; username?: string | null; member_code?: string | null }>);

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

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
      <AdminSupportManager tickets={mapped} />
    </>
  );
}
