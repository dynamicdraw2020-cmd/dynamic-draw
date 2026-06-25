"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv, supabaseConfigured } from "@/lib/env";

export function createClient() {
  if (!supabaseConfigured) {
    throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");
  }
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey);
}
