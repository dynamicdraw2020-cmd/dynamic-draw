import { RUNTIME_LIMITS, errorMessage, isRetryableStatus, publicErrorMessage, sleep, timeoutSignal } from "@/lib/ops/runtime";

type ClientJsonOptions = RequestInit & {
  timeoutMs?: number;
  json?: unknown;
  fallbackMessage?: string;
  retries?: number;
};

async function parseJson(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

async function fetchWithClientTimeout(url: string, options: ClientJsonOptions, attempt: number) {
  const timeoutMs = Math.max(1000, options.timeoutMs ?? RUNTIME_LIMITS.defaultTimeoutMs);
  const signal = timeoutSignal(timeoutMs, options.signal ?? null);
  const headers = new Headers(options.headers ?? {});
  let body = options.body;

  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }

  return fetch(url, {
    ...options,
    headers,
    body,
    signal,
    cache: options.cache ?? "no-store",
  }).catch((error) => {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new Error(`요청 시간이 ${timeoutMs}ms를 초과했습니다. 네트워크 상태를 확인해 주세요.`);
    }
    throw error;
  });
}

export async function clientJsonRequest<T = unknown>(url: string, options: ClientJsonOptions = {}): Promise<T> {
  const retries = Math.max(0, Math.min(options.retries ?? RUNTIME_LIMITS.retryCount, RUNTIME_LIMITS.retryCount));
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithClientTimeout(url, options, attempt);
      const payload = await parseJson(response);

      if (isRetryableStatus(response.status) && attempt < retries) {
        await sleep(RUNTIME_LIMITS.retryBaseDelayMs * (attempt + 1));
        continue;
      }

      if (!response.ok && response.status !== 207) {
        const message =
          (payload as { error?: { message?: string }; message?: string })?.error?.message ||
          (payload as { message?: string })?.message ||
          options.fallbackMessage ||
          "요청을 처리하지 못했습니다.";
        const err = new Error(message) as Error & { status?: number; code?: string; payload?: unknown };
        err.status = response.status;
        err.code = (payload as { error?: { code?: string } })?.error?.code ?? `HTTP_${response.status}`;
        err.payload = payload;
        throw err;
      }

      return payload as T;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(RUNTIME_LIMITS.retryBaseDelayMs * (attempt + 1));
    }
  }

  throw new Error(publicErrorMessage(lastError) || errorMessage(lastError, options.fallbackMessage ?? "요청을 처리하지 못했습니다."));
}

export async function clientApiData<T = unknown>(url: string, options: ClientJsonOptions = {}): Promise<T> {
  const payload = (await clientJsonRequest(url, options)) as { data?: T } | T;
  if (payload && typeof payload === "object" && "data" in payload) return (payload as { data?: T }).data as T;
  return payload as T;
}
