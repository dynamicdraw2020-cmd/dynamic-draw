import { enforceRateLimit, fail, ok, rejectDemoMutation, requestMeta } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const { ip } = requestMeta(request);
  const limited = await enforceRateLimit(`reveal-due:${ip}`, 30, 60); if (limited) return limited;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reveal_due_results");
  if (error) return fail("결과 공개 상태를 확인하지 못했습니다.", 500, "REVEAL_RECOVERY_FAILED");
  return ok({ revealedCount: data ?? 0 });
}
