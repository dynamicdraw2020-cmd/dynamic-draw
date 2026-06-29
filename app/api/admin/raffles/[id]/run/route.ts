import { z } from "zod";
import { databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

type ProfilePick = { id: string; display_name: string | null; username: string | null; member_code: string | null };

async function fallbackRunRaffle(admin: ReturnType<typeof createAdminClient>, raffleId: string) {
  const { data: raffle, error: raffleError } = await admin
    .from("raffle_events")
    .select("id,title,prize_name,required_member_tier_id,status")
    .eq("id", raffleId)
    .maybeSingle();
  if (raffleError || !raffle) throw new Error("추첨 이벤트를 찾을 수 없습니다.");

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id,display_name,username,member_code")
    .eq("status", "APPROVED")
    .eq("role", "USER")
    .limit(20000);
  if (profileError) throw new Error("추첨 대상 회원을 불러오지 못했습니다.");

  let candidates = (profiles ?? []) as ProfilePick[];
  const requiredTierId = (raffle as { required_member_tier_id?: string | null }).required_member_tier_id ?? null;
  if (requiredTierId) {
    const { data: tierRows } = await admin.from("profile_member_tiers").select("profile_id").eq("tier_id", requiredTierId);
    const allowed = new Set(((tierRows ?? []) as Array<{ profile_id: string }>).map((row) => row.profile_id));
    candidates = candidates.filter((profile) => allowed.has(profile.id));
  }

  if (!candidates.length) throw new Error("추첨 대상 회원이 없습니다.");
  const winner = candidates[Math.floor(Math.random() * candidates.length)];
  const executedAt = new Date().toISOString();

  const { error: updateError } = await admin.from("raffle_events").update({
    status: "COMPLETED",
    winner_profile_id: winner.id,
    winner_member_code: winner.member_code,
    winner_display_name: winner.display_name ?? winner.username ?? "회원",
    executed_at: executedAt,
    updated_at: executedAt,
  }).eq("id", raffleId);
  if (updateError) throw new Error("추첨 결과를 저장하지 못했습니다.");

  return {
    raffleId,
    title: (raffle as { title?: string }).title ?? "추첨 이벤트",
    prizeName: (raffle as { prize_name?: string }).prize_name ?? "상품",
    winnerName: winner.display_name ?? winner.username ?? "회원",
    memberCode: winner.member_code ?? "NO-CODE",
    participantCount: candidates.length,
    executedAt,
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const demo = rejectDemoMutation(); if (demo) return demo;
  const csrf = enforceSameOrigin(request); if (csrf) return csrf;
  const guard = await requireApiAdmin("MANAGER"); if ("error" in guard) return guard.error;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return fail("추첨 이벤트 ID가 올바르지 않습니다.", 400, "INVALID_RAFFLE_ID");
  const meta = requestMeta(request);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("execute_member_raffle", { p_raffle_id: id, p_admin_id: guard.auth.userId, p_ip: meta.ip, p_user_agent: meta.userAgent });
  if (!error) return ok(data, 201);
  try {
    const fallback = await fallbackRunRaffle(admin, id);
    await admin.rpc("append_admin_log", { p_admin_id: guard.auth.userId, p_action: "RAFFLE_EVENT_RUN_FALLBACK", p_target_table: "raffle_events", p_target_id: id, p_details: fallback, p_ip: meta.ip, p_user_agent: meta.userAgent });
    return ok(fallback, 201);
  } catch (fallbackError) {
    return fail(fallbackError instanceof Error ? fallbackError.message : databaseRpcErrorMessage(error, "추첨 이벤트를 실행하지 못했습니다."), 409, "RAFFLE_RUN_FAILED", error.code);
  }
}
