import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ action: z.string().trim().min(1) }).passthrough();

function looksAutomated(loginId = "", displayName = "") {
  return /^user\d+[_-][a-z0-9]{4,}$/i.test(loginId)
    || /^u_mr0[a-z0-9_]{5,}$/i.test(loginId)
    || /^user_?[a-z0-9]{8,}$/i.test(loginId)
    || /^user\d+[_-][a-z0-9]{4,}$/i.test(displayName)
    || /^user_?[a-z0-9]{8,}$/i.test(displayName);
}

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");

  const body = parsed.data as Record<string, unknown> & { action: string };
  const admin = createAdminClient();
  const meta = requestMeta(request);

  if (body.action === "block-value") {
    const input = z.object({ kind: z.enum(["IP", "FINGERPRINT", "LOGIN_ID"]), value: z.string().trim().min(2).max(200), reason: z.string().trim().max(300).optional().default("관리자 수동 차단"), minutes: z.coerce.number().int().min(5).max(10080).default(1440) }).parse(body);
    const { data, error } = await admin.from("security_blocklist").insert({ kind: input.kind, value: input.kind === "LOGIN_ID" ? input.value.toLowerCase() : input.value, reason: input.reason, expires_at: new Date(Date.now() + input.minutes * 60 * 1000).toISOString(), is_active: true, created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("차단 규칙을 추가하지 못했습니다.", 400, "SECURITY_BLOCK_FAILED", error.message);
    await admin.from("security_events").insert({ event_type: "ADMIN_SECURITY_BLOCK_ADDED", severity: "MEDIUM", ip_address: meta.ip, login_id: input.kind === "LOGIN_ID" ? input.value : null, reason: input.reason, details: { input, actor: guard.auth.userId } });
    return ok(data, 201);
  }

  if (body.action === "unblock") {
    const input = z.object({ id: z.uuid() }).parse(body);
    const { error } = await admin.from("security_blocklist").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", input.id);
    if (error) return fail("차단을 해제하지 못했습니다.", 400, "SECURITY_UNBLOCK_FAILED", error.message);
    return ok({ id: input.id, unblocked: true });
  }

  if (body.action === "deactivate-expired") {
    const { data, error } = await admin.from("security_blocklist").update({ is_active: false, updated_at: new Date().toISOString() }).eq("is_active", true).lt("expires_at", new Date().toISOString()).select("id");
    if (error) return fail("만료 차단을 정리하지 못했습니다.", 400, "SECURITY_EXPIRED_CLEAN_FAILED", error.message);
    return ok({ updatedCount: data?.length ?? 0 });
  }

  if (body.action === "quarantine-suspicious-pending") {
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const [{ data: pending }, { data: risks }] = await Promise.all([
      admin.from("profiles").select("id,username,display_name,status,role,created_at").eq("status", "PENDING").eq("role", "USER").gte("created_at", since).limit(1000),
      admin.from("signup_risk_assessments").select("profile_id,risk_score,risk_flags,ip_address,browser_fingerprint").gte("created_at", since).limit(3000),
    ]);
    const riskMap = new Map<string, number>();
    for (const row of (risks ?? []) as Array<{ profile_id: string | null; risk_score: number | null }>) {
      if (row.profile_id) riskMap.set(row.profile_id, Math.max(riskMap.get(row.profile_id) ?? 0, Number(row.risk_score ?? 0)));
    }
    const targets = ((pending ?? []) as Array<{ id: string; username?: string | null; display_name?: string | null }>).filter((profile) => looksAutomated(profile.username ?? "", profile.display_name ?? "") || (riskMap.get(profile.id) ?? 0) >= 60);
    if (!targets.length) return ok({ suspendedCount: 0, ids: [] });
    const ids = targets.map((profile) => profile.id);
    const { error } = await admin.from("profiles").update({ status: "SUSPENDED", rejection_reason: "자동 가입/매크로 의심으로 일괄 정지", updated_at: new Date().toISOString() }).in("id", ids);
    if (error) return fail("의심 계정을 정지하지 못했습니다.", 400, "SECURITY_QUARANTINE_FAILED", error.message);
    await admin.from("security_events").insert({ event_type: "ADMIN_SUSPICIOUS_PENDING_QUARANTINE", severity: "HIGH", ip_address: meta.ip, reason: "suspicious pending users quarantined", details: { ids, count: ids.length, actor: guard.auth.userId } });
    return ok({ suspendedCount: ids.length, ids });
  }

  return fail("지원하지 않는 보안 작업입니다.", 404, "UNKNOWN_SECURITY_ACTION");
}
