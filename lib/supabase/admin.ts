import { createClient } from "@supabase/supabase-js";
import { requireServerSecrets } from "@/lib/env";
import { createSupabaseFetch } from "@/lib/ops/safe-fetch";
import { RUNTIME_LIMITS } from "@/lib/ops/runtime";

export function createAdminClient() {
  const { url, secretKey } = requireServerSecrets();
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: createSupabaseFetch({
        label: "supabase-admin",
        timeoutMs: RUNTIME_LIMITS.defaultTimeoutMs,
        retries: RUNTIME_LIMITS.retryCount,
        circuitKey: "supabase-admin",
        returnFallbackResponse: true,
      }),
    },
  });
}
