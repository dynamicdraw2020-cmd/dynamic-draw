import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin, withApiRoute, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeRows } from "@/lib/ops/safe-query";


export const dynamic = "force-dynamic";
export const maxDuration = 5;
const schema = z.object({ action: z.string().trim().min(1) }).passthrough();
const superOnlyActions = new Set(["allow-one-signup", "unblock", "permanent-unblock"]);

function looksAutomated(loginId = "", displayName = "") {
  return (
    /^user\d+[_-][a-z0-9]{4,}$/i.test(loginId) ||
    /^u_mr0[a-z0-9_]{5,}$/i.test(loginId) ||
    /^user_?[a-z0-9]{8,}$/i.test(loginId) ||
    /^user\d+[_-][a-z0-9]{4,}$/i.test(displayName) ||
    /^user_?[a-z0-9]{8,}$/i.test(displayName)
  );
}

function normalizeSecurityValue(kind: string, value: string) {
  const trimmed = value.trim();
  return kind === "LOGIN_ID" ? trimmed.toLowerCase() : trimmed;
}

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiAdmin("MANAGER");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");

  const body = parsed.data as Record<string, unknown> & { action: string };
  const adminRole = String(guard.auth.profile.role ?? "USER");
  if (superOnlyActions.has(body.action) && adminRole !== "SUPER_ADMIN") {
    return fail("이 작업은 최고관리자만 수행할 수 있습니다.", 403, "SUPER_ADMIN_REQUIRED");
  }

  const admin = createAdminClient();
  const meta = requestMeta(request);

  if (body.action === "block-value") {
    const input = z
      .object({
        kind: z.enum(["IP", "FINGERPRINT", "LOGIN_ID"]),
        value: z.string().trim().min(2).max(200),
        reason: z.string().trim().max(300).optional().default("관리자 수동 차단"),
        minutes: z.coerce.number().int().min(5).max(10080).default(1440),
      })
      .parse(body);

    const value = normalizeSecurityValue(input.kind, input.value);
    const { data, error } = await admin
      .from("security_blocklist")
      .insert({
        kind: input.kind,
        value,
        reason: input.reason,
        expires_at: new Date(Date.now() + input.minutes * 60 * 1000).toISOString(),
        is_active: true,
        created_by: guard.auth.userId,
      })
      .select("*")
      .single();

    if (error) return fail("차단 규칙을 추가하지 못했습니다.", 400, "SECURITY_BLOCK_FAILED", error.message);

    await admin.from("security_events").insert({
      event_type: "ADMIN_SECURITY_BLOCK_ADDED",
      severity: "MEDIUM",
      ip_address: meta.ip,
      login_id: input.kind === "LOGIN_ID" ? value : null,
      reason: input.reason,
      details: { input: { ...input, value }, actor: guard.auth.userId },
    });

    return ok(data, 201);
  }

  if (body.action === "allow-one-signup") {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        targetKind: z.enum(["IP", "FINGERPRINT", "LOGIN_ID"]).optional(),
        targetValue: z.string().trim().min(2).max(200).optional(),
        reason: z.string().trim().min(1).max(300).optional().default("최고관리자 1회 가입 허용"),
        expiresMinutes: z.coerce.number().int().min(5).max(1440).optional().default(240),
      })
      .refine((value) => Boolean(value.id || (value.targetKind && value.targetValue)), "차단 항목 또는 대상 값을 입력해 주세요.")
      .parse(body);

    let targetKind = input.targetKind ?? "IP";
    let targetValue = input.targetValue ?? "";
    let sourceBlocklistId: string | null = input.id ?? null;

    if (input.id) {
      const { data: row, error } = await admin
        .from("security_blocklist")
        .select("id,kind,value,reason,is_active")
        .eq("id", input.id)
        .maybeSingle();

      if (error || !row) return fail("차단 항목을 찾지 못했습니다.", 404, "SECURITY_BLOCK_NOT_FOUND", error?.message);
      targetKind = String(row.kind ?? "IP") as "IP" | "FINGERPRINT" | "LOGIN_ID";
      targetValue = String(row.value ?? "");
      sourceBlocklistId = String(row.id);
    }

    const { data, error } = await admin.rpc("create_signup_guard_release", {
      p_target_kind: targetKind,
      p_target_value: normalizeSecurityValue(targetKind, targetValue),
      p_reason: input.reason,
      p_source_security_blocklist_id: sourceBlocklistId,
      p_admin_id: guard.auth.userId,
      p_expires_minutes: input.expiresMinutes,
    });

    if (error) return fail("1회 가입 허용권을 발급하지 못했습니다.", 400, "SIGNUP_GUARD_RELEASE_FAILED", error.message);
    return ok(data, 201);
  }

  // v1.6.8부터 기존 "해제" 요청도 차단 규칙을 끄지 않고 가입 시도 1회 허용권만 발급합니다.
  if (body.action === "unblock") {
    const input = z.object({ id: z.string().uuid(), reason: z.string().trim().max(300).optional().default("최고관리자 1회 가입 허용") }).parse(body);
    const { data: row, error } = await admin
      .from("security_blocklist")
      .select("id,kind,value,reason,is_active")
      .eq("id", input.id)
      .maybeSingle();

    if (error || !row) return fail("차단 항목을 찾지 못했습니다.", 404, "SECURITY_BLOCK_NOT_FOUND", error?.message);

    const targetKind = String(row.kind ?? "IP") as "IP" | "FINGERPRINT" | "LOGIN_ID";
    const { data, error: releaseError } = await admin.rpc("create_signup_guard_release", {
      p_target_kind: targetKind,
      p_target_value: normalizeSecurityValue(targetKind, String(row.value ?? "")),
      p_reason: input.reason,
      p_source_security_blocklist_id: String(row.id),
      p_admin_id: guard.auth.userId,
      p_expires_minutes: 240,
    });

    if (releaseError) return fail("1회 가입 허용권을 발급하지 못했습니다.", 400, "SIGNUP_GUARD_RELEASE_FAILED", releaseError.message);
    return ok({ ...((data ?? {}) as Record<string, unknown>), blockKeptActive: true, oneTimeSignupAllowed: true });
  }

  if (body.action === "permanent-unblock") {
    const input = z.object({ id: z.string().uuid() }).parse(body);
    const { error } = await admin.from("security_blocklist").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", input.id);
    if (error) return fail("차단을 해제하지 못했습니다.", 400, "SECURITY_UNBLOCK_FAILED", error.message);

    await admin.from("security_events").insert({
      event_type: "ADMIN_SECURITY_BLOCK_REMOVED",
      severity: "MEDIUM",
      ip_address: meta.ip,
      reason: "security block permanently removed by super admin",
      details: { id: input.id, actor: guard.auth.userId },
    });

    return ok({ id: input.id, unblocked: true });
  }

  if (body.action === "deactivate-expired") {
    const { data, error } = await admin
      .from("security_blocklist")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("is_active", true)
      .lt("expires_at", new Date().toISOString())
      .select("id");

    if (error) return fail("만료 차단을 정리하지 못했습니다.", 400, "SECURITY_EXPIRED_CLEAN_FAILED", error.message);
    return ok({ updatedCount: data?.length ?? 0 });
  }

  if (body.action === "quarantine-suspicious-pending") {
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const [pending, risks] = await Promise.allSettled([
      safeRows<{ id: string; username?: string | null; display_name?: string | null }>(
        admin.from("profiles").select("id,username,display_name,status,role,created_at").eq("status", "PENDING").eq("role", "USER").gte("created_at", since).limit(1000),
        "security quarantine pending members",
      ),
      safeRows<{ profile_id: string | null; risk_score: number | null }>(
        admin.from("signup_risk_assessments").select("profile_id,risk_score,risk_flags,ip_address,browser_fingerprint").gte("created_at", since).limit(3000),
        "security quarantine risk rows",
      ),
    ]);
    const pendingRows = pending.status === "fulfilled" ? pending.value : [];
    const riskRows = risks.status === "fulfilled" ? risks.value : [];

    const riskMap = new Map<string, number>();
    for (const row of riskRows) {
      if (row.profile_id) riskMap.set(row.profile_id, Math.max(riskMap.get(row.profile_id) ?? 0, Number(row.risk_score ?? 0)));
    }

    const targets = pendingRows.filter(
      (profile) => looksAutomated(profile.username ?? "", profile.display_name ?? "") || (riskMap.get(profile.id) ?? 0) >= 60,
    );

    if (!targets.length) return ok({ suspendedCount: 0, ids: [] });

    const ids = targets.map((profile) => profile.id);
    const { error } = await admin
      .from("profiles")
      .update({ status: "SUSPENDED", rejection_reason: "자동 가입/매크로 의심으로 일괄 정지", updated_at: new Date().toISOString() })
      .in("id", ids);

    if (error) return fail("의심 계정을 정지하지 못했습니다.", 400, "SECURITY_QUARANTINE_FAILED", error.message);

    await admin.from("security_events").insert({
      event_type: "ADMIN_SUSPICIOUS_PENDING_QUARANTINE",
      severity: "HIGH",
      ip_address: meta.ip,
      reason: "suspicious pending users quarantined",
      details: { ids, count: ids.length, actor: guard.auth.userId },
    });

    return ok({ suspendedCount: ids.length, ids });
  }

  return fail("지원하지 않는 보안 작업입니다.", 404, "UNKNOWN_SECURITY_ACTION");
}

export const POST = withApiRoute(postHandler, { routeName: "/api/admin/security", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
