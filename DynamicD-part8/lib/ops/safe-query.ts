import { runtimeLog } from "@/lib/ops/logger";
import { RUNTIME_LIMITS, withTimeout } from "@/lib/ops/runtime";

type SupabaseResult<T> = { data: T | null; error: unknown | null; count?: number | null };

type QueryOptions<T> = {
  label?: string;
  timeoutMs?: number;
  fallback: T;
  logFallback?: boolean;
};

export async function safeQuery<T>(work: PromiseLike<SupabaseResult<T>>, options: QueryOptions<T>): Promise<T> {
  try {
    const result = await withTimeout(work, options.timeoutMs ?? RUNTIME_LIMITS.readQueryTimeoutMs, options.label ?? "supabase query");
    if (result.error || result.data == null) {
      if (options.logFallback !== false) runtimeLog({ level: "WARN", event: "SUPABASE_QUERY_FALLBACK", details: { label: options.label, error: result.error } });
      return options.fallback;
    }
    return result.data;
  } catch (error) {
    if (options.logFallback !== false) runtimeLog({ level: "WARN", event: "SUPABASE_QUERY_TIMEOUT_FALLBACK", details: { label: options.label }, error });
    return options.fallback;
  }
}

export async function safeRows<T>(work: PromiseLike<SupabaseResult<T[]>>, label = "supabase rows", timeoutMs = RUNTIME_LIMITS.readQueryTimeoutMs): Promise<T[]> {
  const data = await safeQuery<T[]>(work, { label, timeoutMs, fallback: [] });
  return Array.isArray(data) ? data : [];
}

export async function safeMaybeOne<T>(work: PromiseLike<SupabaseResult<T>>, label = "supabase maybe single", timeoutMs = RUNTIME_LIMITS.readQueryTimeoutMs): Promise<T | null> {
  return safeQuery<T | null>(work as PromiseLike<SupabaseResult<T | null>>, { label, timeoutMs, fallback: null });
}

export async function safeCount(work: PromiseLike<SupabaseResult<unknown>>, label = "supabase count", timeoutMs = RUNTIME_LIMITS.readQueryTimeoutMs): Promise<number> {
  try {
    const result = await withTimeout(work, timeoutMs, label);
    if (result.error) return 0;
    return Number(result.count ?? 0);
  } catch (error) {
    runtimeLog({ level: "WARN", event: "SUPABASE_COUNT_FALLBACK", details: { label }, error });
    return 0;
  }
}

export function fulfilledValue<T>(result: PromiseSettledResult<T>, fallback: T) {
  return result.status === "fulfilled" ? result.value : fallback;
}
