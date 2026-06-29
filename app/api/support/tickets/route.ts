import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const attachmentSchema = z.object({ name: z.string().max(120), type: z.string().max(80), size: z.number().max(1_200_000), dataUrl: z.string().startsWith("data:image/").max(1_800_000) });
const schema = z.object({ category: z.string().trim().min(1).max(40), title: z.string().trim().min(2).max(100), body: z.string().trim().min(2).max(2000), attachments: z.array(attachmentSchema).max(3).optional().default([]) });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("문의 내용을 확인해 주세요. 사진은 최대 3장, 각 1.2MB 이하입니다.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  const payload = { profile_id: guard.auth.userId, category: parsed.data.category, title: parsed.data.title, body: parsed.data.body, attachments: parsed.data.attachments, status: "OPEN" };
  const { data, error } = await admin.from("support_tickets").insert(payload).select("*").single();
  if (!error) return ok(data, 201);

  // 기존 DB에 attachments 컬럼 적용이 늦은 경우에도 문의 자체는 접수되도록 한 번 더 시도합니다.
  const { data: fallback, error: fallbackError } = await admin
    .from("support_tickets")
    .insert({ profile_id: guard.auth.userId, category: parsed.data.category, title: parsed.data.title, body: parsed.data.body, status: "OPEN" })
    .select("*")
    .single();

  if (fallbackError) return fail("문의를 접수하지 못했습니다.", 400, "SUPPORT_CREATE_FAILED", fallbackError.message);
  return ok({ ...fallback, attachments: [] }, 201);
}
