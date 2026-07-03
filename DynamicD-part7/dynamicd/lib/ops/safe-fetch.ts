import { recordCircuitFailure, recordCircuitSuccess, isCircuitOpen, circuitSnapshot } from "@/lib/ops/circuit-breaker";
import { runtimeLog, logSlowOperation } from "@/lib/ops/logger";
import { RUNTIME_LIMITS, errorMessage, isRetryableOperationalError, isRetryableStatus, monotonicNow, sleep, timeoutSignal } from "@/lib/ops/runtime";

type FetchOptions = {
  label?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  circuitKey?: string;
  returnFallbackResponse?: boolean;
  fallbackStatus?: number;
};

function isSafeMethod(method: string) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function requestMethod(init?: RequestInit) {
  return String(init?.method ?? "GET").toUpperCase();
}

function responseJson(status: number, code: string, message: string, label: string) {
  return new Response(JSON.stringify({ error: code, code, message, label, degraded: true }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-dynamicd-fallback": "1",
    },
  });
}

function urlHost(input: RequestInfo | URL) {
  try {
    const raw = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    return new URL(raw).host;
  } catch {
    return "unknown-host";
  }
}

export async function guardedFetch(input: RequestInfo | URL, init?: RequestInit, options: FetchOptions = {}) {
  const method = requestMethod(init);
  const safeMethod = isSafeMethod(method);
  const timeoutMs = options.timeoutMs ?? RUNTIME_LIMITS.defaultTimeoutMs;
  const retries = Math.max(0, Math.min(options.retries ?? (safeMethod ? RUNTIME_LIMITS.retryCount : 0), RUNTIME_LIMITS.retryCount));
  const retryDelayMs = options.retryDelayMs ?? RUNTIME_LIMITS.retryBaseDelayMs;
  const label = options.label ?? "fetch";
  const circuitKey = options.circuitKey ?? `${label}:${urlHost(input)}`;

  if (isCircuitOpen(circuitKey)) {
    runtimeLog({ level: "WARN", event: "FETCH_CIRCUIT_OPEN", details: circuitSnapshot(circuitKey) });
    if (options.returnFallbackResponse) return responseJson(options.fallbackStatus ?? 503, "CIRCUIT_OPEN", "상위 서비스가 일시적으로 불안정합니다.", label);
    throw new Error(`${label} circuit open`);
  }

  let lastError: unknown;
  const startedAll = monotonicNow();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = monotonicNow();
    try {
      const signal = timeoutSignal(timeoutMs, init?.signal ?? null);
      const response = await fetch(input, { ...init, signal });
      const durationMs = monotonicNow() - started;

      logSlowOperation({ event: "SLOW_FETCH", durationMs, status: response.status, details: { label, attempt, method, host: urlHost(input) } });

      if (isRetryableStatus(response.status) && attempt < retries) {
        await response.arrayBuffer().catch(() => undefined);
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      if (isRetryableStatus(response.status)) recordCircuitFailure(circuitKey, new Error(`HTTP_${response.status}`));
      else recordCircuitSuccess(circuitKey);

      return response;
    } catch (error) {
      lastError = error;
      const durationMs = monotonicNow() - started;
      runtimeLog({
        level: attempt < retries && isRetryableOperationalError(error) ? "WARN" : "ERROR",
        event: "FETCH_ATTEMPT_FAILED",
        durationMs,
        details: { label, attempt, retries, method, host: urlHost(input), retryable: isRetryableOperationalError(error) },
        error,
      });

      if (attempt >= retries || !isRetryableOperationalError(error)) break;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  recordCircuitFailure(circuitKey, lastError);
  runtimeLog({
    level: "ERROR",
    event: "FETCH_FAILED_WITH_FALLBACK",
    durationMs: monotonicNow() - startedAll,
    details: { label, method, host: urlHost(input), circuit: circuitSnapshot(circuitKey) },
    error: lastError,
  });

  if (options.returnFallbackResponse) {
    return responseJson(options.fallbackStatus ?? 503, "UPSTREAM_UNAVAILABLE", "외부 서비스 연결이 일시적으로 불안정합니다.", label);
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

export function createSupabaseFetch(options: FetchOptions = {}) {
  return (input: RequestInfo | URL, init?: RequestInit) =>
    guardedFetch(input, init, {
      label: "supabase",
      timeoutMs: RUNTIME_LIMITS.defaultTimeoutMs,
      retries: RUNTIME_LIMITS.retryCount,
      circuitKey: "supabase-global",
      returnFallbackResponse: true,
      fallbackStatus: 503,
      ...options,
    });
}

export async function safeFetchJson<T>(input: RequestInfo | URL, init: RequestInit | undefined, fallback: T, options: FetchOptions = {}): Promise<T> {
  try {
    const response = await guardedFetch(input, init, options);
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch (error) {
    runtimeLog({ level: "WARN", event: "SAFE_FETCH_JSON_FALLBACK", details: { label: options.label }, error });
    return fallback;
  }
}
