import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ action: z.enum(["create", "delete", "run-one", "process-due", "create-special-announcement"]), id: z.string().optional().nullable(), name: z.string().optional(), jobType: z.string().optional(), scheduledAt: z.string().optional().nullable(), payload: z.record(z.string(), z.unknown()).optional().default({}), rewardId: z.string().optional(), title: z.string().optional(), message: z.string().optional() });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const input = parsed.data;
  const admin = createAdminClient();
  if (input.action === "create") {
    const { data, error } = await admin.from("automation_jobs").insert({ name: input.name || "자동 작업", job_type: input.jobType || "AUTO_GRANT_TICKETS", scheduled_at: input.scheduledAt || null, payload: input.payload, created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("자동 작업을 만들지 못했습니다.", 400, "AUTOMATION_CREATE_FAILED", error.message);
    return ok(data, 201);
  }
  if (input.action === "delete" && input.id) {
    const { error } = await admin.from("automation_jobs").delete().eq("id", input.id);
    if (error) return fail("자동 작업을 삭제하지 못했습니다.", 400, "AUTOMATION_DELETE_FAILED", error.message);
    return ok({ deleted: true });
  }
  if (input.action === "run-one" && input.id) {
    const { data, error } = await admin.rpc("run_automation_job", { p_job_id: input.id, p_actor_id: guard.auth.userId });
    if (error) return fail("자동 작업을 실행하지 못했습니다.", 400, "AUTOMATION_RUN_FAILED", error.message);
    return ok(data);
  }
  if (input.action === "process-due") {
    const { data, error } = await admin.rpc("process_due_automation_jobs", { p_actor_id: guard.auth.userId });
    if (error) return fail("예약 작업을 처리하지 못했습니다.", 400, "AUTOMATION_PROCESS_FAILED", error.message);
    return ok(data);
  }
  if (input.action === "create-special-announcement") {
    const rewardId = input.rewardId ?? "";
    if (!z.uuid().safeParse(rewardId).success) return fail("상품을 선택해 주세요.", 422, "REWARD_REQUIRED");
    const { data, error } = await admin.from("special_reward_announcements").insert({ reward_id: rewardId, title: input.title || "특별 상품 당첨", message: input.message || "{{reward}} 당첨 결과가 공개되었습니다.", created_by: guard.auth.userId }).select("*").single();
    if (error) return fail("전체공지 규칙을 만들지 못했습니다.", 400, "ANNOUNCEMENT_CREATE_FAILED", error.message);
    return ok(data, 201);
  }
  return fail("지원하지 않는 자동화 작업입니다.", 404, "UNKNOWN_AUTOMATION_ACTION");
}
