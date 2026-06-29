import { z } from "zod";
import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { chooseRandomBoxReward, deliverRewards } from "@/lib/reward-engine";

const schema = z.object({ boxId: z.uuid() });

export async function POST(request: Request) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiUser(); if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("랜덤박스를 선택해 주세요.", 422, "VALIDATION_ERROR");
  const admin = createAdminClient();
  const { data: owned } = await admin.from("user_random_boxes").select("quantity").eq("profile_id", guard.auth.userId).eq("box_id", parsed.data.boxId).maybeSingle();
  const quantity = Number((owned as { quantity?: number } | null)?.quantity ?? 0);
  if (quantity < 1) return fail("개봉할 랜덤박스가 없습니다.", 409, "BOX_NOT_OWNED");
  const selected = await chooseRandomBoxReward(admin, parsed.data.boxId);
  if (!selected) return fail("랜덤박스 보상 확률이 설정되지 않았습니다.", 409, "BOX_REWARD_NOT_CONFIGURED");
  const next = quantity - 1;
  const update = next > 0
    ? admin.from("user_random_boxes").update({ quantity: next, updated_at: new Date().toISOString() }).eq("profile_id", guard.auth.userId).eq("box_id", parsed.data.boxId)
    : admin.from("user_random_boxes").delete().eq("profile_id", guard.auth.userId).eq("box_id", parsed.data.boxId);
  const { error: consumeError } = await update;
  if (consumeError) return fail("랜덤박스를 차감하지 못했습니다.", 400, "BOX_CONSUME_FAILED", consumeError.message);
  const meta = requestMeta(request);
  const delivered = await deliverRewards({ admin, profileId: guard.auth.userId, rewards: [selected.reward], sourceType: "RANDOM_BOX_OPEN", sourceId: parsed.data.boxId, createdBy: guard.auth.userId, ip: meta.ip, userAgent: meta.userAgent, notifyTitle: "랜덤박스 개봉 결과", notifyBody: `${selected.reward.label ?? selected.reward.type} 보상이 지급되었습니다.` });
  const { data: log } = await admin.from("random_box_open_logs").insert({ profile_id: guard.auth.userId, box_id: parsed.data.boxId, selected_reward_id: selected.row.id, reward_snapshot: delivered }).select("*").single();
  return ok({ log, reward: delivered[0] ?? selected.reward, remaining: next }, 201);
}
