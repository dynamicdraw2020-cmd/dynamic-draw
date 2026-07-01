import type { Metadata } from "next";
import { SecurityControlPanel } from "@/components/security-control-panel";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfilledValue, safeCount, safeRows } from "@/lib/ops/safe-query";

export const metadata: Metadata = { title: "보안 방어" };
export const dynamic = "force-dynamic";

type SecurityEventRow = { id: string; event_type: string; severity: string; ip_address: string | null; browser_fingerprint: string | null; login_id: string | null; display_name: string | null; reason: string | null; created_at: string };
type BlockRow = { id: string; kind: string; value: string; reason: string | null; expires_at: string | null; is_active: boolean; created_at: string };
type ReleaseRow = { id: string; target_kind: string; target_value: string; release_reason: string | null; status: string; used_count: number; max_uses: number; expires_at: string; created_at: string; consumed_at: string | null; consumed_login_id: string | null; consumed_ip: string | null; consumed_browser_fingerprint: string | null; issued_by: string | null };

export default async function AdminSecurityPage() {
  const currentAdmin = await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const canReleaseSignupGuard = currentAdmin.role === "SUPER_ADMIN";

  const [eventsResult, blocklistResult, releasesResult, events24hResult, critical24hResult, pendingMembersResult, riskLogs24hResult] = await Promise.allSettled([
    safeRows<SecurityEventRow>(
      admin
        .from("security_events")
        .select("id,event_type,severity,ip_address,browser_fingerprint,login_id,display_name,reason,created_at")
        .order("created_at", { ascending: false })
        .limit(120),
      "admin security events",
    ),
    safeRows<BlockRow>(
      admin
        .from("security_blocklist")
        .select("id,kind,value,reason,expires_at,is_active,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(120),
      "admin security blocklist",
    ),
    canReleaseSignupGuard
      ? safeRows<ReleaseRow>(
          admin
            .from("signup_guard_releases")
            .select("id,target_kind,target_value,release_reason,status,used_count,max_uses,expires_at,created_at,consumed_at,consumed_login_id,consumed_ip,consumed_browser_fingerprint,issued_by")
            .order("created_at", { ascending: false })
            .limit(120),
          "admin signup guard releases",
        )
      : Promise.resolve([] as ReleaseRow[]),
    safeCount(admin.from("security_events").select("id", { count: "exact", head: true }).gte("created_at", since24h), "security events 24h"),
    safeCount(admin.from("security_events").select("id", { count: "exact", head: true }).gte("created_at", since24h).in("severity", ["HIGH", "CRITICAL"]), "critical security events 24h"),
    safeCount(admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "PENDING"), "pending members count"),
    safeCount(admin.from("signup_risk_assessments").select("id", { count: "exact", head: true }).gte("created_at", since24h), "risk logs 24h"),
  ]);

  const data = {
    events: fulfilledValue(eventsResult, [] as SecurityEventRow[]),
    blocklist: fulfilledValue(blocklistResult, [] as BlockRow[]),
    releases: fulfilledValue(releasesResult, [] as ReleaseRow[]),
    canReleaseSignupGuard,
    stats: {
      events24h: fulfilledValue(events24hResult, 0),
      critical24h: fulfilledValue(critical24hResult, 0),
      pendingMembers: fulfilledValue(pendingMembersResult, 0),
      riskLogs24h: fulfilledValue(riskLogs24hResult, 0),
    },
  };

  return (
    <>
      <div className="panel panel-pad">
        <h1>보안 방어</h1>
        <p className="muted">가입 매크로, 중복 가입, 의심 IP와 기기를 차단하고 1회 가입 허용을 관리합니다.</p>
      </div>
      <SecurityControlPanel data={data} />
    </>
  );
}
