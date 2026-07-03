import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { consumeLocalRateLimit, apiLimitForPath, rateLimitHeaders } from "@/lib/ops/rate-limit";
import { createRequestId, runtimeLog } from "@/lib/ops/logger";
import { getRequestFingerprint, inspectAttackSurface, isSuspiciousUserAgent, securityHeaders } from "@/lib/ops/security";

const STATIC_EXTENSION = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?|ttf|otf)$/i;

function applyHeaders(response: NextResponse, requestId: string) {
  for (const [key, value] of Object.entries(securityHeaders())) response.headers.set(key, value);
  response.headers.set("X-DynamicD-Runtime-Guard", "v1.7.2");
  response.headers.set("X-Request-ID", requestId);
  return response;
}


function isOperationalHealthPath(pathname: string) {
  return pathname === "/api/ping" || pathname === "/api/health" || pathname === "/api/ready";
}

function blockedResponse(request: NextRequest, requestId: string, reason: string, status = 403, retryAfter?: number) {
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const headers: Record<string, string> = {
    "cache-control": "no-store, max-age=0",
    ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
  };

  const response = isApi
    ? NextResponse.json({ ok: false, error: { code: status === 429 ? "RATE_LIMITED" : "REQUEST_BLOCKED", message: "허용되지 않은 요청입니다.", details: reason } }, { status, headers })
    : new NextResponse("잠시 후 다시 시도해 주세요.", { status, headers });

  return applyHeaders(response, requestId);
}

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || createRequestId("edge");
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search;
  const fp = getRequestFingerprint(request.headers);

  if (!STATIC_EXTENSION.test(pathname)) {
    const attackReason = inspectAttackSurface({ pathname, search, headers: request.headers });
    if (attackReason) {
      runtimeLog({ level: "WARN", event: "PROXY_ATTACK_BLOCK", route: pathname, method: request.method, requestId, ip: fp.ip, userAgent: fp.userAgent, details: { reason: attackReason } });
      return blockedResponse(request, requestId, attackReason, 403);
    }

    if (isSuspiciousUserAgent(fp.userAgent, pathname) && !isOperationalHealthPath(pathname)) {
      runtimeLog({ level: "WARN", event: "PROXY_BOT_BLOCK", route: pathname, method: request.method, requestId, ip: fp.ip, userAgent: fp.userAgent });
      return blockedResponse(request, requestId, "SUSPICIOUS_USER_AGENT", 403);
    }

    const limit = apiLimitForPath(pathname);
    const bucket = consumeLocalRateLimit(`${limit.kind}:${fp.ip}:${pathname.startsWith("/api") ? pathname : "page"}`, limit.limit, limit.windowSeconds);
    if (!bucket.allowed) {
      runtimeLog({ level: "WARN", event: "PROXY_RATE_LIMIT", route: pathname, method: request.method, requestId, ip: fp.ip, userAgent: fp.userAgent, status: 429, details: { kind: limit.kind, limit: limit.limit, retryAfter: bucket.retryAfter } });
      const response = blockedResponse(request, requestId, "RATE_LIMIT", 429, bucket.retryAfter);
      for (const [key, value] of Object.entries(rateLimitHeaders(bucket))) response.headers.set(key, value);
      return response;
    }
  }

  try {
    const response = await updateSession(request);
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("X-DynamicD-Client-IP", fp.ip);
    return applyHeaders(response, requestId);
  } catch (error) {
    // 사이트 전체 관문에서는 절대 throw하지 않습니다. Auth/DB 장애 시에도 페이지는 열립니다.
    runtimeLog({ level: "ERROR", event: "PROXY_FALLBACK_NEXT", route: pathname, method: request.method, requestId, ip: fp.ip, userAgent: fp.userAgent, error });
    return applyHeaders(NextResponse.next({ request }), requestId);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?|ttf|otf)$).*)"],
};
