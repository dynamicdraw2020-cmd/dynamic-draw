import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ category: z.string().trim().min(1).max(40), title: z.string().trim().min(2).max(100), body: z.string().trim().min(3).max(2000) });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("문의 내용을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const { data, error } = await createAdminClient().from("support_tickets").insert({ profile_id: guard.auth.userId, ...parsed.data }).select("*").single();
  if (error) return fail("문의를 접수하지 못했습니다.", 400, "SUPPORT_CREATE_FAILED", error.message);
  return ok(data, 201);
}
