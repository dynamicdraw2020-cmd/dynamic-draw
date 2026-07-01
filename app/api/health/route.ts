import { ok, withApiRoute } from "@/lib/api";
import { publicEnv, supabaseAdminConfigured, supabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { circuitSnapshot } from "@/lib/ops/circuit-breaker";
import { RUNTIME_LIMITS, monotonicNow, withTimeout } from "@/lib/ops/runtime";


export const maxDuration = 5;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getHandler() {
  const started = monotonicNow();
  let db = { ok: false, ms: 0, message: "not checked" };

  if (supabaseAdminConfigured) {
    const dbStart = monotonicNow();
    try {
      const admin = createAdminClient();
      const result = await withTimeout(admin.from("profiles").select("id", { count: "exact", head: true }).limit(1), RUNTIME_LIMITS.readQueryTimeoutMs, "health db ping");
      db = { ok: !result.error, ms: monotonicNow() - dbStart, message: result.error?.message ?? "ok" };
    } catch (error) {
      db = { ok: false, ms: monotonicNow() - dbStart, message: error instanceof Error ? error.message : "db check failed" };
    }
  }

  return ok({
    status: db.ok ? "healthy" : "degraded",
    app: { ok: true, ms: monotonicNow() - started },
    db,
    env: { supabaseConfigured, supabaseAdminConfigured, siteUrl: publicEnv.siteUrl },
    circuit: {
      admin: circuitSnapshot("supabase-admin"),
      server: circuitSnapshot("supabase-server"),
      auth: circuitSnapshot("supabase-proxy-auth"),
    },
    timestamp: new Date().toISOString(),
  }, db.ok ? 200 : 207);
}

export const GET = withApiRoute(getHandler, { routeName: "/api/health", rateLimit: false });
