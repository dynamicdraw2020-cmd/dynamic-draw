import { NextResponse } from "next/server";
import { requireApiAdmin, requestMeta, withApiRoute } from "@/lib/api";
import { publicEnv, supabaseAdminConfigured, supabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";


export const maxDuration = 5;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = {
  name: string;
  ok: boolean;
  ms: number;
  message: string;
  details?: unknown;
};

type CountResult = { table: string; ok: boolean; count: number | null; ms: number; message: string };

function nowMs() {
  return Math.round(performance.now());
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkDatabase() {
  const start = nowMs();
  try {
    const admin = createAdminClient();
    const result = await withTimeout(
      admin.from("profiles").select("id", { count: "exact", head: true }).limit(1),
      4000,
      "database profile ping",
    );
    const ms = nowMs() - start;
    if (result.error) {
      return { name: "database", ok: false, ms, message: result.error.message, details: result.error.code } satisfies CheckResult;
    }
    return { name: "database", ok: true, ms, message: "Supabase service-role query OK", details: { profilesCount: result.count ?? null } } satisfies CheckResult;
  } catch (error) {
    return { name: "database", ok: false, ms: nowMs() - start, message: error instanceof Error ? error.message : "database check failed" } satisfies CheckResult;
  }
}

async function checkRpc() {
  const start = nowMs();
  try {
    const admin = createAdminClient();
    const result = await withTimeout(admin.rpc("dynamic_draw_install_status"), 4000, "install status rpc");
    const ms = nowMs() - start;
    if (result.error) return { name: "install_rpc", ok: false, ms, message: result.error.message, details: result.error.code } satisfies CheckResult;
    return { name: "install_rpc", ok: true, ms, message: "dynamic_draw_install_status RPC OK", details: result.data ?? null } satisfies CheckResult;
  } catch (error) {
    return { name: "install_rpc", ok: false, ms: nowMs() - start, message: error instanceof Error ? error.message : "RPC check failed" } satisfies CheckResult;
  }
}

async function countTable(table: string): Promise<CountResult> {
  const start = nowMs();
  try {
    const admin = createAdminClient();
    const result = await withTimeout(admin.from(table).select("*", { count: "exact", head: true }), 4000, `${table} count`);
    const ms = nowMs() - start;
    if (result.error) return { table, ok: false, count: null, ms, message: result.error.message };
    return { table, ok: true, count: result.count ?? 0, ms, message: "OK" };
  } catch (error) {
    return { table, ok: false, count: null, ms: nowMs() - start, message: error instanceof Error ? error.message : "count failed" };
  }
}


function settledValue<T>(result: PromiseSettledResult<T>, fallback: T) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function trafficEstimate(counts: CountResult[], db: CheckResult) {
  const dbMs = db.ok ? db.ms : 9999;
  const hasCoreTables = counts.filter((item) => item.ok).length >= 4;
  let level: "LOW" | "NORMAL" | "WATCH" | "RISK" = "NORMAL";
  let message = "기본 운영 트래픽은 처리 가능한 상태입니다.";

  if (!supabaseConfigured || !supabaseAdminConfigured || !db.ok) {
    level = "RISK";
    message = "환경변수 또는 DB 연결이 불안정합니다. 트래픽 검증 전에 연결부터 복구해야 합니다.";
  } else if (dbMs > 1500 || !hasCoreTables) {
    level = "WATCH";
    message = "DB 응답이 느리거나 일부 테이블 점검이 실패했습니다. 동시 접속이 늘면 병목이 생길 수 있습니다.";
  } else if (dbMs < 250) {
    level = "NORMAL";
    message = "현재 ping 기준으로는 양호합니다. 실제 수용량은 아래 트래픽 체크 스크립트로 측정하세요.";
  }

  return {
    level,
    message,
    note: "이 값은 실시간 ping 기반 운영 판단입니다. 최대 동시접속/RPS는 Vercel·Supabase 요금제와 실제 DB 쿼리량에 따라 달라집니다.",
  };
}

async function getHandler(request: Request) {
  const started = nowMs();
  const guard = await requireApiAdmin("VIEWER");
  if ("error" in guard) return guard.error;

  const appCheck: CheckResult = {
    name: "app",
    ok: true,
    ms: 0,
    message: "Next.js route handler alive",
    details: {
      region: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "local",
      node: process.version,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    },
  };

  const dbCheck = await checkDatabase();
  const rpcCheck = await checkRpc();
  const countResults = await Promise.allSettled([
    countTable("profiles"),
    countTable("draws"),
    countTable("results"),
    countTable("support_tickets"),
    countTable("security_events"),
  ]);
  const fallbackCount = (table: string): CountResult => ({ table, ok: false, count: null, ms: 0, message: "fallback" });
  const counts = [
    settledValue(countResults[0], fallbackCount("profiles")),
    settledValue(countResults[1], fallbackCount("draws")),
    settledValue(countResults[2], fallbackCount("results")),
    settledValue(countResults[3], fallbackCount("support_tickets")),
    settledValue(countResults[4], fallbackCount("security_events")),
  ];

  const checks = [appCheck, dbCheck, rpcCheck];
  const healthy = appCheck.ok && dbCheck.ok && counts.some((item) => item.table === "profiles" && item.ok);
  const meta = requestMeta(request);
  const payload = {
    ok: healthy,
    status: healthy ? "healthy" : "degraded",
    checkedAt: new Date().toISOString(),
    totalMs: nowMs() - started,
    environment: {
      supabaseConfigured,
      supabaseAdminConfigured,
      siteUrl: publicEnv.siteUrl,
      vercelEnv: process.env.VERCEL_ENV ?? "local",
      region: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "local",
    },
    requester: { ip: meta.ip, userAgent: meta.userAgent.slice(0, 160) },
    checks,
    tableCounts: counts,
    traffic: trafficEstimate(counts, dbCheck),
  };

  try {
    const admin = createAdminClient();
    await admin.from("server_status_snapshots").insert({
      checked_by: guard.auth.userId,
      status: payload.status,
      app_ms: appCheck.ms,
      db_ms: dbCheck.ms,
      details: payload,
    });
  } catch {
    // SQL 적용 전에도 상태 화면은 계속 열려야 합니다.
  }

  return NextResponse.json({ ok: healthy, data: payload }, { status: healthy ? 200 : 207 });
}

export const GET = withApiRoute(getHandler, { routeName: "/api/admin/server-status", rateLimit: { kind: "admin", limit: 20, windowSeconds: 60 } });
