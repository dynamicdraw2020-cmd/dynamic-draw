import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv, supabaseConfigured } from "@/lib/env";
import { createSupabaseFetch } from "@/lib/ops/safe-fetch";
import { RUNTIME_LIMITS, withTimeout } from "@/lib/ops/runtime";
import { securityHeaders } from "@/lib/ops/security";

function applyProxyHeaders(response: NextResponse) {
  for (const [key, value] of Object.entries(securityHeaders())) response.headers.set(key, value);
  response.headers.set("X-DynamicD-Proxy", "ok");
  return response;
}

export async function updateSession(request: NextRequest) {
  let response = applyProxyHeaders(NextResponse.next({ request }));
  if (!supabaseConfigured) return response;

  try {
    const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
      global: {
        fetch: createSupabaseFetch({
          label: "supabase-proxy-auth",
          timeoutMs: RUNTIME_LIMITS.proxyAuthTimeoutMs,
          retries: 0,
          circuitKey: "supabase-proxy-auth",
          returnFallbackResponse: true,
        }),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = applyProxyHeaders(NextResponse.next({ request }));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { error } = await withTimeout(supabase.auth.getUser(), RUNTIME_LIMITS.proxyAuthTimeoutMs, "proxy auth refresh");
    if (error) response.headers.set("X-DynamicD-Auth-State", "degraded");
  } catch {
    // Supabase Auth가 522/524/네트워크 오류로 흔들려도 전체 사이트 접속은 막지 않습니다.
    response.headers.set("X-DynamicD-Auth-State", "degraded");
  }

  return response;
}
