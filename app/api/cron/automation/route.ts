import { fail, ok } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return fail("권한이 없습니다.", 401, "UNAUTHORIZED");
  const { data, error } = await createAdminClient().rpc("process_due_automation_jobs", { p_actor_id: null });
  if (error) return fail("자동화 작업을 실행하지 못했습니다.", 500, "CRON_AUTOMATION_FAILED", error.message);
  return ok(data);
}
