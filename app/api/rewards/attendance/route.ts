import { enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiUser, withApiRoute } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverRewards, type RewardItem } from "@/lib/reward-engine";
import { trackStepMission } from "@/lib/step-events";

export const dynamic = "force-dynamic";
export const maxDuration = 5;
export const runtime = "nodejs";

function kstDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

async function postHandler(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const admin = createAdminClient();
  const today = kstDateString();
  const { data: existing } = await admin.from("attendance_logs").select("id").eq("profile_id", guard.auth.userId).eq("attendance_date", today).maybeSingle();
  if (existing) return fail("오늘 출석은 이미 완료되었습니다.", 409, "ALREADY_ATTENDED");

  const rewards = await getAttendanceRewards(admin, guard.auth.userId, today);
  const { data, error } = await admin
    .from("attendance_logs")
    .insert({ profile_id: guard.auth.userId, attendance_date: today, source: "SELF", streak_count: rewards.streak, reward_snapshot: rewards.items })
    .select("*")
    .single();
  if (error) return fail("출석 체크를 처리하지 못했습니다.", 400, "ATTENDANCE_FAILED", error.message);

  const meta = requestMeta(request);
  const delivered = await deliverRewards({
    admin,
    profileId: guard.auth.userId,
    rewards: rewards.items as RewardItem[],
    sourceType: "ATTENDANCE",
    sourceId: data.id,
    createdBy: guard.auth.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    notifyTitle: "출석 보상 지급",
  });

  await trackStepMission({
    admin,
    profileId: guard.auth.userId,
    missionType: "ATTENDANCE",
    amount: 1,
    sourceType: "ATTENDANCE",
    sourceId: data.id,
    autoClaim: true,
    details: { date: today, streak: rewards.streak, monthCount: rewards.monthCount },
  });

  return ok({ attendance: data, rewards: delivered }, 201);
}

async function getAttendanceRewards(admin: ReturnType<typeof createAdminClient>, profileId: string, date: string) {
  const { data: logs } = await admin.from("attendance_logs").select("attendance_date").eq("profile_id", profileId).lt("attendance_date", date).order("attendance_date", { ascending: false }).limit(40);
  let streak = 1;
  let cursor = new Date(`${date}T00:00:00+09:00`);
  const existingDates = new Set(((logs ?? []) as Array<{ attendance_date: string }>).map((row) => row.attendance_date));
  for (;;) {
    cursor = new Date(cursor.getTime() - 86400000);
    const key = cursor.toISOString().slice(0, 10);
    if (existingDates.has(key)) streak += 1;
    else break;
  }

  const monthPrefix = date.slice(0, 7);
  const { count } = await admin.from("attendance_logs").select("id", { count: "exact", head: true }).eq("profile_id", profileId).gte("attendance_date", `${monthPrefix}-01`).lte("attendance_date", date);
  const monthCount = (count ?? 0) + 1;
  const { data: rules } = await admin.from("attendance_reward_rules").select("rewards,rule_type,required_count").eq("is_active", true);
  const items = ((rules ?? []) as Array<{ rewards: Array<Record<string, unknown>>; rule_type: string; required_count: number }>).flatMap((rule) => {
    if (rule.rule_type === "DAILY") return rule.rewards;
    if (rule.rule_type === "STREAK" && rule.required_count === streak) return rule.rewards;
    if (rule.rule_type === "MONTHLY" && rule.required_count === monthCount) return rule.rewards;
    return [];
  });

  return { streak, monthCount, items };
}

export const POST = withApiRoute(postHandler, {
  routeName: "/api/rewards/attendance",
  rateLimit: { kind: "api", limit: 30, windowSeconds: 60 },
});
