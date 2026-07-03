import { RUNTIME_LIMITS, errorMessage, monotonicNow, safeDiagnostics, type RuntimeSeverity } from "@/lib/ops/runtime";

export type RuntimeLogInput = {
  level?: RuntimeSeverity;
  event: string;
  route?: string;
  method?: string;
  requestId?: string;
  ip?: string;
  userId?: string | null;
  userAgent?: string;
  status?: number;
  durationMs?: number;
  details?: unknown;
  error?: unknown;
};

export function createRequestId(prefix = "req") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function redactForLog(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(redactForLog);

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase();
    if (lowered.includes("password") || lowered.includes("secret") || lowered.includes("token") || lowered.includes("authorization") || lowered.includes("cookie")) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redactForLog(entry);
    }
  }
  return output;
}

export function runtimeLog(input: RuntimeLogInput) {
  if (process.env.NODE_ENV === "test") return;
  const level = input.level ?? (input.error ? "ERROR" : "INFO");
  const payload = {
    ts: new Date().toISOString(),
    service: "dynamic-draw",
    level,
    event: input.event,
    route: input.route,
    method: input.method,
    requestId: input.requestId,
    ip: input.ip,
    userId: input.userId,
    status: input.status,
    durationMs: input.durationMs,
    userAgent: input.userAgent?.slice(0, 180),
    error: input.error ? safeDiagnostics(input.error) : undefined,
    details: redactForLog(input.details),
  };

  const line = JSON.stringify(payload);
  if (level === "ERROR" || level === "CRITICAL") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

export function slowSeverity(durationMs: number): RuntimeSeverity | null {
  if (durationMs >= RUNTIME_LIMITS.slowErrorMs) return "ERROR";
  if (durationMs >= RUNTIME_LIMITS.slowWarnMs) return "WARN";
  return null;
}

export function logSlowOperation(input: Omit<RuntimeLogInput, "level" | "event"> & { event?: string }) {
  const durationMs = input.durationMs ?? 0;
  const severity = slowSeverity(durationMs);
  if (!severity) return;
  runtimeLog({ ...input, level: severity, event: input.event ?? "SLOW_OPERATION" });
}

export async function measured<T>(label: string, work: () => Promise<T>, meta?: Omit<RuntimeLogInput, "event" | "durationMs" | "error">): Promise<T> {
  const started = monotonicNow();
  try {
    const result = await work();
    logSlowOperation({ ...meta, event: "SLOW_OPERATION", durationMs: monotonicNow() - started, details: { label } });
    return result;
  } catch (error) {
    runtimeLog({ ...meta, level: "ERROR", event: "OPERATION_FAILED", durationMs: monotonicNow() - started, error, details: { label, message: errorMessage(error) } });
    throw error;
  }
}
