import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv, supabaseConfigured } from "@/lib/env";

export async function createClient() {
  if (!supabaseConfigured) {
    throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");
  }

  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component 렌더링 중에는 쿠키 쓰기가 막힐 수 있습니다.
          // 루트 proxy.ts에서 세션 갱신을 담당합니다.
        }
      },
    },
  });
}
