import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  title: z.string().trim().min(2, "공지 제목은 2자 이상 입력해 주세요.").max(80),
  body: z.string().trim().min(2, "공지 내용을 입력해 주세요.").max(2000),
  isPinned: z.boolean().optional().default(false),
  isPublic: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "공지 정보를 확인해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  const { data, error } = await admin.from("notices").insert({ title: parsed.data.title, body: parsed.data.body, is_pinned: parsed.data.isPinned, is_public: parsed.data.isPublic, created_by: guard.auth.userId }).select("*").single();
  if (error || !data) return fail("공지 등록에 실패했습니다.", 400, "NOTICE_CREATE_FAILED", error?.message);
  const meta = requestMeta(request);
  await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "NOTICE_CREATED", p_target_table: "notices", p_target_id: data.id, p_details: data, p_ip: meta.ip, p_user_agent: meta.userAgent });
  return ok(data, 201);
}
