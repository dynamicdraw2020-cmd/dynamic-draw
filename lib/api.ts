import { NextResponse } from "next/server";
import { demoMode, supabaseAdminConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmergencyProfileIdFromCookies } from "@/lib/emergency-session";
import type { Profile } from "@/lib/types";
import {
  type AdminCapability,
  type AdminRole,
  hasAnyAdminRole,
  hasCapability,
  hasMinimumRole,
} from "@/lib/admin-capabilities";
import { consumeLocalRateLimit, rateLimitHeaders } from "@/lib/ops/rate-limit";
import { createRequestId, logSlowOperation, runtimeLog } from "@/lib/ops/logger";
import { OperationTimeoutError, RUNTIME_LIMITS, publicErrorCode, publicErrorMessage, safeDiagnostics, withTimeout } from "@/lib/ops/runtime";
import { getRequestFingerprint, inspectAttackSurface, isSuspiciousUserAgent, securityHeaders } from "@/lib/ops/security";
import { recordAuditEventSoon, recordRuntimeEventSoon } from "@/lib/ops/db-events";

type RpcErrorLike = { code?: string; message?: string; details?: string; hint?: string };
type ApiRateKind = "api" | "login" | "admin" | "recovery" | "public";

function isOperationalHealthPath(pathname: string) {
  return pathname === "/api/ping" || pathname === "/api/health" || pathname === "/api/ready";
}

type ApiRouteOptions = {
  routeName?: string;
  timeoutMs?: number;
  rateLimit?: { key?: string; limit: number; windowSeconds: number; kind?: ApiRateKind } | false;
};

function jsonHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  headers.set("cache-control", headers.get("cache-control") || "no-store, max-age=0");
  return headers;
}

function attachRuntimeHeaders(response: Response, requestId?: string, durationMs?: number) {
  try {
    for (const [key, value] of Object.entries(securityHeaders())) response.headers.set(key, value);
    response.headers.set("X-DynamicD-Api-Guard", "v1.7.2");
    if (requestId) response.headers.set("X-Request-ID", requestId);
    if (durationMs != null) response.headers.set("X-Response-Time-Ms", String(durationMs));
    if (!response.headers.get("cache-control")) response.headers.set("cache-control", "no-store, max-age=0");
    return response;
  } catch {
    return response;
  }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: jsonHeaders() });
}

export function fail(message: string, status = 400, code = "BAD_REQUEST", details?: unknown, headers?: HeadersInit) {
  const merged = jsonHeaders(headers);
  if (status === 429 && !merged.get("Retry-After")) merged.set("Retry-After", "60");
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status, headers: merged });
}

export function rejectDemoMutation() {
  if (!demoMode && supabaseAdminConfigured) return null;
  return fail("저장 기능을 사용하려면 Supabase 공개 키와 서버 전용 Secret key를 모두 연결해야 합니다.", 503, "DEMO_MODE");
}

export function requestMeta(request: Request) {
  const fp = getRequestFingerprint(request.headers);
  return {
    ip: fp.ip,
    userAgent: fp.userAgent,
    country: fp.country ?? null,
    host: fp.host ?? null,
  };
}

async function readRequestTextWithLimit(request: Request, maxBytes: number, timeoutMs: number) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw Object.assign(new Error("request body too large"), { status: 413, code: "REQUEST_BODY_TOO_LARGE" });

  if (!request.body) {
    return await withTimeout(request.text(), timeoutMs, "read request body");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let received = 0;
  const started = Date.now();

  try {
    while (true) {
      const remainingMs = timeoutMs - (Date.now() - started);
      if (remainingMs <= 0) throw new OperationTimeoutError("read request body", timeoutMs);

      const { value, done } = await withTimeout(reader.read(), remainingMs, "read request body chunk");
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > maxBytes) throw Object.assign(new Error("request body too large"), { status: 413, code: "REQUEST_BODY_TOO_LARGE" });
        chunks.push(decoder.decode(value, { stream: true }));
      }
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

export async function readJsonWithLimit<T = unknown>(request: Request, maxBytes = RUNTIME_LIMITS.maxJsonBytes): Promise<T | null> {
  const text = await readRequestTextWithLimit(request, maxBytes, RUNTIME_LIMITS.defaultTimeoutMs);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw Object.assign(new Error("invalid json body"), { status: 400, code: "INVALID_JSON_BODY", cause: error });
  }
}

export function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0]?.trim();

  if (!origin) {
    if (fetchSite === "same-origin" || fetchSite === "same-site" || !fetchSite) return null;
    return fail("요청 출처를 확인할 수 없습니다.", 403, "CSRF_BLOCKED");
  }

  try {
    if (!host || new URL(origin).host !== host || (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite))) {
      return fail("허용되지 않은 요청 출처입니다.", 403, "CSRF_BLOCKED");
    }
  } catch {
    return fail("요청 출처를 확인할 수 없습니다.", 403, "CSRF_BLOCKED");
  }

  return null;
}

export async function getApiProfile(): Promise<{ profile: Profile; userId: string } | null> {
  if (demoMode) return null;

  try {
    const emergencyProfileId = await getEmergencyProfileIdFromCookies();
    if (emergencyProfileId) {
      const admin = createAdminClient();
      const profileResult = await withTimeout(admin.from("profiles").select("*").eq("id", emergencyProfileId).maybeSingle(), RUNTIME_LIMITS.readQueryTimeoutMs, "api emergency profile lookup");
      if (!profileResult.error && profileResult.data) return { profile: profileResult.data as Profile, userId: emergencyProfileId };
    }
  } catch {
    // 긴급 복구 세션 확인 실패는 일반 Supabase 세션 확인으로 이어진다.
  }

  try {
    const supabase = await createClient();
    const userResult = await withTimeout(supabase.auth.getUser(), RUNTIME_LIMITS.authTimeoutMs, "api auth getUser");
    const user = userResult.data.user;
    if (!user) return null;

    const profileResult = await withTimeout(supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(), RUNTIME_LIMITS.readQueryTimeoutMs, "api profile lookup");
    if (profileResult.error || !profileResult.data) return null;

    return { profile: profileResult.data as Profile, userId: user.id };
  } catch (error) {
    runtimeLog({ level: "WARN", event: "API_PROFILE_FALLBACK_NULL", error });
    return null;
  }
}

export async function requireApiUser() {
  const auth = await getApiProfile();
  if (!auth) return { error: fail("로그인이 필요합니다.", 401, "UNAUTHORIZED") } as const;

  if (auth.profile.status !== "APPROVED") {
    return { error: fail("관리자 승인이 필요한 계정입니다.", 403, "ACCOUNT_NOT_APPROVED") } as const;
  }

  try {
    const admin = createAdminClient();

    if (String(auth.profile.role) === "USER") {
      const { data: modeRow } = await withTimeout(admin.from("site_settings").select("value").eq("key", "operation_mode").maybeSingle(), RUNTIME_LIMITS.readQueryTimeoutMs, "operation mode check");
      const mode = String((modeRow as { value?: unknown } | null)?.value ?? "ACTIVE").replace(/^"|"$/g, "");

      if (mode === "UPDATING" || mode === "READ_ONLY") {
        return { error: fail("현재 업데이트중입니다.\n잠시 후 다시 이용해 주세요.", 503, "OPERATION_UPDATING") } as const;
      }

      if (mode === "INACTIVE" || mode === "MAINTENANCE") {
        return { error: fail("현재 사이트가 비활성화되어 있습니다.", 503, "OPERATION_INACTIVE") } as const;
      }
    }

    const { count } = await withTimeout(
      admin
        .from("blacklist_entries")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", auth.profile.id)
        .eq("status", "ACTIVE")
        .in("scope", ["ALL", "LOGIN"]),
      RUNTIME_LIMITS.readQueryTimeoutMs,
      "blacklist check",
    );

    if ((count ?? 0) > 0) {
      return { error: fail("운영 정책에 따라 이용이 제한된 계정입니다.", 403, "ACCOUNT_RESTRICTED") } as const;
    }
  } catch {
    // 블랙리스트/운영 모드 테이블이 아직 적용되지 않은 기존 설치와의 호환을 위해 무시합니다.
  }

  return { auth } as const;
}

export async function requireApiAdmin(minimum: AdminRole = "VIEWER") {
  const user = await requireApiUser();
  if ("error" in user) return user;

  try {
    const admin = createAdminClient();
    const { data: modeRow } = await withTimeout(admin.from("site_settings").select("value").eq("key", "operation_mode").maybeSingle(), RUNTIME_LIMITS.readQueryTimeoutMs, "admin operation mode check");
    const mode = String((modeRow as { value?: unknown } | null)?.value ?? "ACTIVE").replace(/^"|"$/g, "");

    if ((mode === "INACTIVE" || mode === "MAINTENANCE") && String(user.auth.profile.role) !== "SUPER_ADMIN") {
      return { error: fail("현재 사이트가 비활성화되어 최고 관리자만 접근할 수 있습니다.", 503, "OPERATION_ADMIN_BLOCKED") } as const;
    }
  } catch {}

  if (!hasAnyAdminRole(user.auth.profile.role) || !hasMinimumRole(user.auth.profile.role, minimum)) {
    return { error: fail("이 작업을 수행할 권한이 없습니다.", 403, "FORBIDDEN") } as const;
  }

  return user;
}

export async function requireApiAdminAny(allowedRoles: readonly AdminRole[]) {
  const guard = await requireApiAdmin("VIEWER");
  if ("error" in guard) return guard;

  if (!allowedRoles.includes(String(guard.auth.profile.role) as AdminRole)) {
    return { error: fail("이 작업을 수행할 권한이 없습니다.", 403, "FORBIDDEN") } as const;
  }

  return guard;
}

export async function requireApiCapability(capability: AdminCapability) {
  const guard = await requireApiAdmin("VIEWER");
  if ("error" in guard) return guard;

  if (!hasCapability(guard.auth.profile.role, capability)) {
    return { error: fail("이 작업을 수행할 권한이 없습니다.", 403, "FORBIDDEN") } as const;
  }

  return guard;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const local = consumeLocalRateLimit(key, limit, windowSeconds);
  if (!local.allowed) {
    return fail("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, "RATE_LIMITED", undefined, rateLimitHeaders(local));
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await withTimeout(
      admin.rpc("consume_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      }),
      RUNTIME_LIMITS.readQueryTimeoutMs,
      "db rate limit",
    );

    if (!error && data === false) {
      return fail("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, "RATE_LIMITED", undefined, { "Retry-After": String(windowSeconds) });
    }

    if (error) runtimeLog({ level: "WARN", event: "DB_RATE_LIMIT_FALLBACK_LOCAL", details: { key, code: (error as RpcErrorLike).code, message: (error as RpcErrorLike).message } });
    return null;
  } catch (error) {
    // DB가 죽었다고 전체 API를 죽이지 않습니다. proxy/local rate limit으로 최소 방어합니다.
    runtimeLog({ level: "WARN", event: "DB_RATE_LIMIT_UNAVAILABLE_ALLOW_LOCAL", details: { key }, error });
    return null;
  }
}

type ApiHandlerResult = Response | null | undefined;

export function withApiRoute<TContext = unknown>(
  handler: (request: Request, context: TContext) => Promise<ApiHandlerResult> | ApiHandlerResult,
  options: ApiRouteOptions = {},
) {
  return async function guardedRoute(request: Request, context: TContext): Promise<Response> {
    const started = Date.now();
    const requestId = request.headers.get("x-request-id") || createRequestId("api");
    const meta = requestMeta(request);
    const route = options.routeName || (() => {
      try {
        return new URL(request.url).pathname;
      } catch {
        return "unknown";
      }
    })();

    try {
      const url = new URL(request.url);
      const attackReason = inspectAttackSurface({ pathname: url.pathname, search: url.search, headers: request.headers });
      if (attackReason) return fail("허용되지 않은 요청입니다.", 403, "REQUEST_BLOCKED", attackReason);
      if (isSuspiciousUserAgent(meta.userAgent, url.pathname) && !isOperationalHealthPath(url.pathname)) return fail("허용되지 않은 요청입니다.", 403, "REQUEST_BLOCKED", "SUSPICIOUS_USER_AGENT");

      if (options.rateLimit !== false && options.rateLimit) {
        const rateKey = options.rateLimit.key || `${options.rateLimit.kind ?? "api"}:${meta.ip}:${route}`;
        const bucket = consumeLocalRateLimit(rateKey, options.rateLimit.limit, options.rateLimit.windowSeconds);
        if (!bucket.allowed) {
          const limited = fail("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, "RATE_LIMITED", undefined, rateLimitHeaders(bucket));
          return attachRuntimeHeaders(limited, requestId, Date.now() - started);
        }
      }

      const handled = await withTimeout(Promise.resolve(handler(request, context)), options.timeoutMs ?? RUNTIME_LIMITS.routeTimeoutMs, `api ${route}`);
      const response = handled ?? fail("요청 처리 결과를 만들지 못했습니다.", 500, "EMPTY_API_RESPONSE");
      const durationMs = Date.now() - started;
      logSlowOperation({ event: "SLOW_API_ROUTE", route, method: request.method, requestId, ip: meta.ip, userAgent: meta.userAgent, status: response.status, durationMs });
      runtimeLog({ level: response.status >= 500 ? "ERROR" : response.status >= 400 ? "WARN" : "INFO", event: "API_ROUTE_COMPLETED", route, method: request.method, requestId, ip: meta.ip, userAgent: meta.userAgent, status: response.status, durationMs });

      if (response.status >= 500 || durationMs >= RUNTIME_LIMITS.slowWarnMs) {
        recordRuntimeEventSoon({
          requestId,
          level: response.status >= 500 ? "error" : "warn",
          eventType: response.status >= 500 ? "API_ROUTE_5XX" : "API_ROUTE_SLOW",
          route,
          method: request.method,
          ip: meta.ip,
          status: response.status,
          responseTimeMs: durationMs,
          details: { userAgent: meta.userAgent?.slice(0, 180) },
        });
      }

      if (route.startsWith("/api/admin") && request.method !== "GET") {
        recordAuditEventSoon({
          requestId,
          action: `ADMIN_${request.method}_${route.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase()}`,
          route,
          ip: meta.ip,
          userAgent: meta.userAgent,
          details: { status: response.status, responseTimeMs: durationMs },
        });
      }

      return attachRuntimeHeaders(response, requestId, durationMs);
    } catch (error) {
      const durationMs = Date.now() - started;
      const status = Number((error as { status?: unknown })?.status ?? (publicErrorCode(error) === "OPERATION_TIMEOUT" ? 504 : 500));
      runtimeLog({ level: "ERROR", event: "API_ROUTE_FAILED", route, method: request.method, requestId, ip: meta.ip, userAgent: meta.userAgent, status, durationMs, error, details: safeDiagnostics(error) });
      recordRuntimeEventSoon({
        requestId,
        level: status >= 500 ? "error" : "warn",
        eventType: "API_ROUTE_FAILED",
        route,
        method: request.method,
        ip: meta.ip,
        status,
        responseTimeMs: durationMs,
        details: safeDiagnostics(error),
      });
      return attachRuntimeHeaders(fail(publicErrorMessage(error), status, publicErrorCode(error), safeDiagnostics(error)), requestId, durationMs);
    }
  };
}

export function databaseRpcErrorMessage(error: unknown, fallback: string) {
  const candidate = error && typeof error === "object" ? (error as RpcErrorLike) : {};
  const raw = [candidate.message, candidate.details, candidate.hint].filter(Boolean).join(" ");
  const lowered = raw.toLowerCase();

  if (
    lowered.includes("function digest") ||
    lowered.includes("gen_random_bytes") ||
    (lowered.includes("pgcrypto") && lowered.includes("does not exist"))
  ) {
    return "DB 보안 함수 연결을 수정해야 합니다.\nSupabase SQL Editor에서 DB 보정 SQL을 한 번 실행해 주세요.";
  }

  return candidate.message || fallback;
}
