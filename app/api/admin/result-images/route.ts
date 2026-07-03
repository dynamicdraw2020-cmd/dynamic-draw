import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requireApiAdmin, readJsonWithLimit } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  action: z.enum(["create", "delete"]),
  id: z.string().optional().nullable(),
  resultId: z.string().optional().nullable(),
  rewardId: z.string().optional().nullable(),
  title: z.string().trim().min(1).max(100).optional().default("𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 추첨 결과"),
  winnerText: z.string().trim().max(100).optional().default(""),
  prizeText: z.string().trim().max(100).optional().default(""),
  message: z.string().trim().max(300).optional().default(""),
  imageDataUrl: z.string().max(800000).optional().nullable(),
});

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await readJsonWithLimit(request).catch(() => null));
  if (!parsed.success) return fail("이미지 설정값을 확인해 주세요.", 422, "VALIDATION_ERROR");
  const input = parsed.data;
  const admin = createAdminClient();
  if (input.action === "delete") {
    if (!input.id || !z.uuid().safeParse(input.id).success) return fail("삭제할 템플릿을 선택해 주세요.", 422, "TEMPLATE_ID_REQUIRED");
    const { error } = await admin.from("result_image_templates").delete().eq("id", input.id);
    if (error) return fail("결과 이미지 템플릿을 삭제하지 못했습니다.", 400, "RESULT_IMAGE_DELETE_FAILED", error.message);
    return ok({ deleted: true });
  }
  const resultId = input.resultId && z.uuid().safeParse(input.resultId).success ? input.resultId : null;
  const rewardId = input.rewardId && z.uuid().safeParse(input.rewardId).success ? input.rewardId : null;
  const { data, error } = await admin.from("result_image_templates").insert({ result_id: resultId, reward_id: rewardId, title: input.title, winner_text: input.winnerText || null, prize_text: input.prizeText || null, message: input.message || null, image_data_url: input.imageDataUrl || null, created_by: guard.auth.userId }).select("*").single();
  if (error) return fail("결과 이미지 템플릿을 등록하지 못했습니다.", 400, "RESULT_IMAGE_CREATE_FAILED", error.message);
  return ok(data, 201);
}
