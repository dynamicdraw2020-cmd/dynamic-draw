import { fail, ok, withApiRoute } from "@/lib/api";
import { getRuntimeEnvReport } from "@/lib/env-check";
import { createAdminClient } from "@/lib/supabase/admin";
import { RUNTIME_LIMITS, withTimeout } from "@/lib/ops/runtime";


export const maxDuration = 5;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getHandler() {
  const env = getRuntimeEnvReport();
  if (!env.ok) return fail("운영 환경변수가 완전하지 않습니다.", 503, "ENV_NOT_READY", env);

  try {
    const admin = createAdminClient();
    const { error } = await withTimeout(admin.rpc("dynamic_draw_install_status"), RUNTIME_LIMITS.readQueryTimeoutMs, "ready install status");
    if (error) return fail("DB 설치 상태 RPC가 응답하지 않습니다.", 503, "DB_NOT_READY", { env, error: error.message });
  } catch (error) {
    return fail("DB 준비 상태를 확인하지 못했습니다.", 503, "DB_NOT_READY", error instanceof Error ? error.message : "unknown");
  }

  return ok({ ready: true, env, timestamp: new Date().toISOString() });
}

export const GET = withApiRoute(getHandler, { routeName: "/api/ready", rateLimit: false });
