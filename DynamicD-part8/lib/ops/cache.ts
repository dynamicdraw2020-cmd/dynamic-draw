type CacheEntry<T> = { value: T; expiresAt: number };
type GlobalWithCache = typeof globalThis & { __dynamicdTtlCache?: Map<string, CacheEntry<unknown>> };

const globalState = globalThis as GlobalWithCache;
const cache = globalState.__dynamicdTtlCache ?? new Map<string, CacheEntry<unknown>>();
globalState.__dynamicdTtlCache = cache;

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlSeconds: number): T {
  cache.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000 });
  if (cache.size > 2000) {
    const now = Date.now();
    for (const [cacheKey, entry] of cache.entries()) if (entry.expiresAt <= now) cache.delete(cacheKey);
  }
  return value;
}

export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>, fallback: T): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== null) return hit;
  try {
    return setCached(key, await loader(), ttlSeconds);
  } catch {
    return fallback;
  }
}
