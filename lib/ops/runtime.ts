export const RUNTIME_LIMITS = {
  defaultTimeoutMs: Number(process.env.DYNAMICD_TIMEOUT_MS || 5_000),
  routeTimeoutMs: Number(process.env.DYNAMICD_ROUTE_TIMEOUT_MS || 5_000),
  authTimeoutMs: Number(process.env.DYNAMICD_AUTH_TIMEOUT_MS || 5_000),
  readQueryTimeoutMs: Number(process.env.DYNAMICD_READ_TIMEOUT_MS || 5_000),
  writeQueryTimeoutMs: Number(process.env.DYNAMICD_WRITE_TIMEOUT_MS || 5_000),
  proxyAuthTimeoutMs: Number(process.env.DYNAMICD_PROXY_AUTH_TIMEOUT_MS || 2_500),
  loadingTimeoutMs: Number(process.env.NEXT_PUBLIC_DYNAMICD_LOADING_TIMEOUT_MS || 10_000),
  maxJsonBytes: Number(process.env.DYNAMICD_MAX_JSON_BYTES || 256 * 1024),
  retryCount: 2,
  retryBaseDelayMs: 120,
  circuitFailureThreshold: 5,
  circuitCooldownMs: 60_000,
  slowWarnMs: 3_000,
  slowErrorMs: 5_000,
} as const;

export type RuntimeSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";

export class OperationTimeoutError extends Error {
  code = "OPERATION_TIMEOUT";
  status = 504;
  retryable = true;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
  }
}

export function monotonicNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return Math.round(performance.now());
  return Date.now();
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function timeoutSignal(timeoutMs: number, original?: AbortSignal | null) {
  const safeTimeout = Math.max(1, timeoutMs);
  const timeout = AbortSignal.timeout(safeTimeout);
  if (!original) return timeout;
  if (original.aborted) return original;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([original, timeout]);
  return timeout;
}

export async function withTimeout<T>(work: PromiseLike<T>, timeoutMs = RUNTIME_LIMITS.defaultTimeoutMs, label = "operation"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new OperationTimeoutError(label, timeoutMs)), Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function errorName(error: unknown) {
  return error instanceof Error ? error.name : "";
}

export function errorMessage(error: unknown, fallback = "unknown error") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? fallback);
  return fallback;
}

export function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; code?: unknown };
  const status = Number(candidate.status ?? candidate.code);
  return Number.isFinite(status) ? status : undefined;
}

export function isRetryableStatus(status: number | null | undefined) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 522 || status === 524;
}

export function isAuthRetryableFetchError(error: unknown) {
  const raw = `${errorName(error)} ${errorMessage(error)} ${errorStatus(error) ?? ""}`.toLowerCase();
  return raw.includes("authretryablefetcherror") || (raw.includes("auth") && raw.includes("fetch") && raw.includes("retry"));
}

export function isRetryableOperationalError(error: unknown) {
  const name = errorName(error).toLowerCase();
  const message = errorMessage(error).toLowerCase();
  const status = errorStatus(error);

  return (
    isAuthRetryableFetchError(error) ||
    name.includes("aborterror") ||
    name.includes("timeouterror") ||
    name.includes("operationtimeouterror") ||
    message.includes("network request failed") ||
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("service temporarily unavailable") ||
    message.includes("connection") ||
    message.includes("gateway") ||
    message.includes("522") ||
    message.includes("524") ||
    isRetryableStatus(status)
  );
}

export function publicErrorCode(error: unknown) {
  if (error instanceof OperationTimeoutError) return "OPERATION_TIMEOUT";
  if (isAuthRetryableFetchError(error)) return "SUPABASE_AUTH_RETRYABLE_FETCH_ERROR";
  if (isRetryableOperationalError(error)) return "UPSTREAM_TEMPORARILY_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

export function publicErrorMessage(error: unknown) {
  if (error instanceof OperationTimeoutError) return "요청 처리 시간이 길어져 안전하게 중단했습니다. 잠시 후 다시 시도해 주세요.";
  if (isAuthRetryableFetchError(error)) return "인증 서버 연결이 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.";
  if (isRetryableOperationalError(error)) return "외부 서비스 연결이 일시적으로 불안정합니다. 페이지는 유지되며 잠시 후 다시 시도해 주세요.";
  return "요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

export function safeDiagnostics(error: unknown) {
  const status = errorStatus(error);
  const name = errorName(error) || undefined;
  const message = errorMessage(error);
  const isProd = process.env.NODE_ENV === "production";

  return {
    name,
    status,
    retryable: isRetryableOperationalError(error),
    code: publicErrorCode(error),
    message: isProd ? undefined : message.slice(0, 500),
  };
}
