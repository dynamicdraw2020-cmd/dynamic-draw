"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv, supabaseConfigured } from "@/lib/env";
import { createSupabaseFetch } from "@/lib/ops/safe-fetch";
import { RUNTIME_LIMITS } from "@/lib/ops/runtime";

export function createClient() {
  if (!supabaseConfigured) {
    throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");
  }

  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    global: {
      fetch: createSupabaseFetch({
        label: "supabase-browser",
        timeoutMs: RUNTIME_LIMITS.defaultTimeoutMs,
        retries: RUNTIME_LIMITS.retryCount,
        circuitKey: "supabase-browser",
        returnFallbackResponse: true,
      }),
    },
  });
}
