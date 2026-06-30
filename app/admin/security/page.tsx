import type { Metadata } from "next";
import { SecurityControlPanel } from "@/components/security-control-panel";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "보안 방어" };
export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [events, blocklist, events24h, critical24h, pendingMembers, riskLogs24h] = await Promise.all([
    admin.from("security_events").select("id,event_type,severity,ip_address,browser_fingerprint,login_id,display_name,reason,created_at").order("created_at", { ascending: false }).limit(120),
    admin.from("security_blocklist").select("id,kind,value,reason,expires_at,is_active,created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(120),
    admin.from("security_events").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    admin.from("security_events").select("id", { count: "exact", head: true }).gte("created_at", since24h).in("severity", ["HIGH", "CRITICAL"]),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).gte("created_at", since24h),
  ]);

  const data = {
    events: events.data ?? [],
    blocklist: blocklist.data ?? [],
    stats: {
      events24h: events24h.count ?? 0,
      critical24h: critical24h.count ?? 0,
      pendingMembers: pendingMembers.count ?? 0,
      riskLogs24h: riskLogs24h.count ?? 0,
    },
  };

  return <main>
    <div className="page-heading"><h1>보안 방어</h1><p>가입 매크로, 중복 가입, 의심 IP와 기기를 차단하고 정리합니다.</p></div>
    <SecurityControlPanel data={data} />
  </main>;
}
