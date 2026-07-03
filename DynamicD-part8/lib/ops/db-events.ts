import { createAdminClient } from "@/lib/supabase/admin";
import { RUNTIME_LIMITS, withTimeout } from "@/lib/ops/runtime";

function dbEventTimeoutMs() {
  return Math.min(1_500, Math.max(300, RUNTIME_LIMITS.writeQueryTimeoutMs));
}

function enabled(name: string) {
  return process.env[name] !== "0" && process.env[name] !== "false";
}

export function recordRuntimeEventSoon(input: {
  requestId?: string;
  level: "info" | "warn" | "error" | "critical";
  eventType: string;
  route?: string;
  method?: string;
  ip?: string;
  userId?: string | null;
  status?: number;
  responseTimeMs?: number;
  details?: Record<string, unknown>;
}) {
  if (!enabled("DYNAMICD_DB_RUNTIME_EVENTS")) return;

  void (async () => {
    try {
      const admin = createAdminClient();
      await withTimeout(
        admin.rpc("record_runtime_event", {
          p_request_id: input.requestId ?? null,
          p_level: input.level,
          p_event_type: input.eventType,
          p_route: input.route ?? null,
          p_method: input.method ?? null,
          p_ip_address: input.ip ?? null,
          p_user_id: input.userId ?? null,
          p_status: input.status ?? null,
          p_response_time_ms: input.responseTimeMs ?? null,
          p_details: input.details ?? {},
        }),
        dbEventTimeoutMs(),
        "record runtime event",
      );
    } catch {
      // 운영 로그 저장 실패가 실제 요청 실패로 전파되면 안 됩니다.
    }
  })();
}

export function recordAuditEventSoon(input: {
  requestId?: string;
  actorId?: string | null;
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  route?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}) {
  if (!enabled("DYNAMICD_DB_AUDIT_EVENTS")) return;

  void (async () => {
    try {
      const admin = createAdminClient();
      await withTimeout(
        admin.rpc("record_ops_audit_event", {
          p_request_id: input.requestId ?? null,
          p_actor_id: input.actorId ?? null,
          p_action: input.action,
          p_target_table: input.targetTable ?? null,
          p_target_id: input.targetId ?? null,
          p_route: input.route ?? null,
          p_ip_address: input.ip ?? null,
          p_user_agent: input.userAgent ?? null,
          p_details: input.details ?? {},
        }),
        dbEventTimeoutMs(),
        "record audit event",
      );
    } catch {
      // 감사 로그 저장 실패가 관리자 작업 자체를 막으면 안 됩니다.
    }
  })();
}
