import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ action: z.enum(["approve", "reject", "delete", "toggle-featured"]), id: z.uuid() });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("요청값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  if (parsed.data.action === "delete") {
    const { error } = await admin.from("winner_reviews").delete().eq("id", parsed.data.id);
    if (error) return fail("후기를 삭제하지 못했습니다.", 400, "REVIEW_DELETE_FAILED", error.message);
    return ok({ deleted: true });
  }
  if (parsed.data.action === "toggle-featured") {
    const { data: row } = await admin.from("winner_reviews").select("is_featured").eq("id", parsed.data.id).maybeSingle();
    const { error } = await admin.from("winner_reviews").update({ is_featured: !Boolean(row?.is_featured), approved_by: guard.auth.userId, approved_at: new Date().toISOString() }).eq("id", parsed.data.id);
    if (error) return fail("후기 노출 상태를 변경하지 못했습니다.", 400, "REVIEW_FEATURE_FAILED", error.message);
    return ok({ featured: true });
  }
  const status = parsed.data.action === "approve" ? "APPROVED" : "REJECTED";
  const { error } = await admin.from("winner_reviews").update({ status, approved_by: guard.auth.userId, approved_at: new Date().toISOString() }).eq("id", parsed.data.id);
  if (error) return fail("후기 상태를 변경하지 못했습니다.", 400, "REVIEW_STATUS_FAILED", error.message);
  return ok({ status });
}
