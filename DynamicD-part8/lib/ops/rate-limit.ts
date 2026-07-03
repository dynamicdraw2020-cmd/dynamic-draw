type Bucket = { count: number; resetAt: number };
type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number; retryAfter: number; limit: number };

type GlobalWithRateLimit = typeof globalThis & {
  __dynamicdRateLimits?: Map<string, Bucket>;
};

const globalState = globalThis as GlobalWithRateLimit;
const buckets = globalState.__dynamicdRateLimits ?? new Map<string, Bucket>();
globalState.__dynamicdRateLimits = buckets;

function cleanup(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function consumeLocalRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  cleanup(now);
  const windowMs = Math.max(1, windowSeconds) * 1000;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: next.resetAt, retryAfter: 0, limit };
  }

  bucket.count += 1;
  const allowed = bucket.count <= limit;
  const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return { allowed, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt, retryAfter, limit };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}),
  };
}

export function apiLimitForPath(pathname: string) {
  if (/\/api\/auth\/login/i.test(pathname)) return { kind: "login", limit: 10, windowSeconds: 60 };
  if (/\/api\/admin\/(recover|.*recovery)/i.test(pathname)) return { kind: "recovery", limit: 5, windowSeconds: 60 };
  if (/\/api\/admin/i.test(pathname)) return { kind: "admin", limit: 20, windowSeconds: 60 };
  if (/\/api/i.test(pathname)) return { kind: "api", limit: 60, windowSeconds: 60 };
  return { kind: "page", limit: 180, windowSeconds: 60 };
}
