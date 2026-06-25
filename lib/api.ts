import { NextResponse } from "next/server";
import { demoMode, supabaseAdminConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400, code = "BAD_REQUEST", details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

export function rejectDemoMutation() {
  if (!demoMode && supabaseAdminConfigured) return null;
  return fail("저장 기능을 사용하려면 Supabase 공개 키와 서버 전용 Secret key를 모두 연결해야 합니다.", 503, "DEMO_MODE");
}

export async function getApiProfile(): Promise<{ profile: Profile; userId: string } | null> {
  if (demoMode) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) return null;
  return { profile: data as Profile, userId: user.id };
}

export async function requireApiUser() {
  const auth = await getApiProfile();
  if (!auth) return { error: fail("로그인이 필요합니다.", 401, "UNAUTHORIZED") } as const;
  if (auth.profile.status !== "APPROVED") {
    return { error: fail("관리자 승인이 필요한 계정입니다.", 403, "ACCOUNT_NOT_APPROVED") } as const;
  }
  return { auth } as const;
}

export async function requireApiAdmin(minimum: "VIEWER" | "MANAGER" | "SUPER_ADMIN" = "VIEWER") {
  const user = await requireApiUser();
  if ("error" in user) return user;
  const rank = { USER: 0, VIEWER: 1, MANAGER: 2, SUPER_ADMIN: 3 } as const;
  if (rank[user.auth.profile.role] < rank[minimum]) {
    return { error: fail("이 작업을 수행할 권한이 없습니다.", 403, "FORBIDDEN") } as const;
  }
  return user;
}

export function requestMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return {
    ip: forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown",
    userAgent: request.headers.get("user-agent") || "unknown",
  };
}


export function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0]?.trim();

  if (!origin) {
    if (fetchSite === "same-origin") return null;
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

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error || data !== true) return fail("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, "RATE_LIMITED");
    return null;
  } catch {
    return fail("요청 제한 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503, "RATE_LIMIT_UNAVAILABLE");
  }
}
