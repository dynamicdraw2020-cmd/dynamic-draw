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
  try {
    const admin = createAdminClient();
    const { count } = await admin.from("blacklist_entries").select("id", { count: "exact", head: true }).eq("profile_id", auth.profile.id).eq("status", "ACTIVE").in("scope", ["ALL", "LOGIN"]);
    if ((count ?? 0) > 0) return { error: fail("운영 정책에 따라 이용이 제한된 계정입니다.", 403, "ACCOUNT_RESTRICTED") } as const;
  } catch {
    // 블랙리스트 테이블이 아직 적용되지 않은 기존 설치와의 호환을 위해 무시합니다.
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

type RpcErrorLike = { code?: string; message?: string; details?: string; hint?: string };

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      const candidate = error as RpcErrorLike;
      return fail(
        "요청 제한 기능이 DB와 연결되지 않았습니다. 관리자에게 DB 보정 SQL 적용 여부를 확인해 달라고 알려 주세요.",
        503,
        "RATE_LIMIT_UNAVAILABLE",
        candidate.code ?? candidate.message,
      );
    }

    if (data !== true) {
      return fail("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, "RATE_LIMITED");
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return fail(
      "요청 제한 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
      "RATE_LIMIT_UNAVAILABLE",
      message,
    );
  }
}

export function databaseRpcErrorMessage(error: unknown, fallback: string) {
  const candidate = error && typeof error === "object" ? error as RpcErrorLike : {};
  const raw = [candidate.message, candidate.details, candidate.hint].filter(Boolean).join(" ");
  const lowered = raw.toLowerCase();

  if (
    lowered.includes("function digest")
    || lowered.includes("gen_random_bytes")
    || (lowered.includes("pgcrypto") && lowered.includes("does not exist"))
  ) {
    return "DB 보안 함수 연결을 수정해야 합니다. Supabase SQL Editor에서 4_DB_보정_v1.0.3.sql을 한 번 실행해 주세요.";
  }

  return candidate.message || fallback;
}
