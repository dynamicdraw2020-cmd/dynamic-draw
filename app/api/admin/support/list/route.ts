import { fail, ok, requireApiCapability, withApiRoute } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";
async function getHandler() {
  const guard = await requireApiCapability("SUPPORT_REPLY");
  if ("error" in guard) return guard.error;

  try {
    const admin = createAdminClient();
    const { data: rpcData, error: rpcError } = await admin.rpc("get_admin_support_tickets", { p_limit: 500 });

    if (!rpcError && Array.isArray(rpcData)) {
      return ok({ tickets: rpcData, count: rpcData.length, source: "rpc" });
    }

    const { data: tickets, error } = await admin
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) return fail(error.message, 500, "ADMIN_SUPPORT_LIST_DB_FAILED", { rpc: rpcError?.message });

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

    return ok({ tickets: mapped, count: mapped.length, source: "table" });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "문의 목록을 불러오지 못했습니다.", 500, "ADMIN_SUPPORT_LIST_FAILED");
  }
}

export const GET = withApiRoute(getHandler, { routeName: "/api/admin/support/list", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
