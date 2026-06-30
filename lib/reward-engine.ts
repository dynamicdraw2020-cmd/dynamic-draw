import { createHash, randomInt, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

export type RewardItem = {
  type: "CURRENCY" | "TICKET" | "ITEM" | "RANDOM_BOX" | "EXP";
  amount?: number;
  currencyId?: string;
  drawId?: string;
  rewardId?: string;
  boxId?: string;
  label?: string;
  displayLabel?: string;
  displayName?: string;
  name?: string;
};

type DeliveryOptions = {
  admin: AdminClient;
  profileId: string;
  rewards: RewardItem[];
  sourceType: string;
  sourceId?: string | null;
  createdBy?: string | null;
  memo?: string;
  ip?: string;
  userAgent?: string;
  notifyTitle?: string;
  notifyBody?: string;
};

type ProfileLite = { id: string; display_name?: string | null; username?: string | null; referral_code?: string | null; referred_by?: string | null };

type SettingRow = { key: string; value: unknown };

type BoxRewardRow = {
  id: string;
  reward_type: RewardItem["type"];
  amount: number;
  currency_id: string | null;
  draw_id: string | null;
  reward_id: string | null;
  random_box_id: string | null;
  label: string | null;
  probability_units: number;
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanRewards(value: unknown): RewardItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): RewardItem | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const type = String(row.type ?? row.reward_type ?? "").toUpperCase();
      if (!["CURRENCY", "TICKET", "ITEM", "RANDOM_BOX", "EXP"].includes(type)) return null;
      return {
        type: type as RewardItem["type"],
        amount: Math.max(1, Math.floor(asNumber(row.amount, 1))),
        currencyId: typeof row.currencyId === "string" ? row.currencyId : typeof row.currency_id === "string" ? row.currency_id : undefined,
        drawId: typeof row.drawId === "string" ? row.drawId : typeof row.draw_id === "string" ? row.draw_id : undefined,
        rewardId: typeof row.rewardId === "string" ? row.rewardId : typeof row.reward_id === "string" ? row.reward_id : undefined,
        boxId: typeof row.boxId === "string" ? row.boxId : typeof row.random_box_id === "string" ? row.random_box_id : undefined,
        label: typeof row.label === "string" ? row.label : undefined,
      };
    })
    .filter((item): item is RewardItem => Boolean(item));
}

export function makeReferralCode(seed: string) {
  const digest = createHash("sha1").update(seed).digest("hex").slice(0, 12);
  const value = (Number.parseInt(digest, 16) % 90_000_000) + 10_000_000;
  return String(value).slice(0, 8);
}

export function normalizeReferralCodeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\D/g, "").slice(0, 8);
}

export function isNumericReferralCode(value: string | null | undefined) {
  return typeof value === "string" && /^[0-9]{1,8}$/.test(value);
}

export async function nextNumericReferralCode(admin: AdminClient, seed = "") {
  const { data } = await admin.rpc("next_numeric_referral_code");
  if (typeof data === "string" && /^[0-9]{8}$/.test(data)) return data;
  for (let i = 0; i < 20; i += 1) {
    const code = String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0");
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("referral_code", code);
    if ((count ?? 0) === 0) return code;
  }
  for (let i = 0; i < 20; i += 1) {
    const code = makeReferralCode(`${seed}:${i}:${profileSafeRandomSeed()}`);
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("referral_code", code);
    if ((count ?? 0) === 0) return code;
  }
  return makeReferralCode(`${seed}:fallback`);
}

function profileSafeRandomSeed() {
  try { return randomUUID(); } catch { return `${Date.now()}:${Math.random()}`; }
}

export async function ensureReferralCode(admin: AdminClient, profile: ProfileLite) {
  // 중요: 화면 조회/로그인 과정에서 전달받은 profile.referral_code가 비어 있어도 바로 재발급하지 않습니다.
  // 먼저 DB의 현재 값을 다시 확인해서 기존 추천 ID를 계정 고유값으로 보존합니다.
  const { data: current } = await admin
    .from("profiles")
    .select("referral_code")
    .eq("id", profile.id)
    .maybeSingle();
  const currentCode = (current as { referral_code?: string | null } | null)?.referral_code ?? profile.referral_code ?? null;
  if (isNumericReferralCode(currentCode) && currentCode.length === 8) return currentCode;

  const code = await nextNumericReferralCode(admin, profile.id);
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ referral_code: code })
    .eq("id", profile.id)
    .is("referral_code", null)
    .select("referral_code")
    .maybeSingle();

  if (!error && isNumericReferralCode((updated as { referral_code?: string | null } | null)?.referral_code)) {
    return String((updated as { referral_code: string }).referral_code);
  }

  const { data: after } = await admin.from("profiles").select("referral_code").eq("id", profile.id).maybeSingle();
  const afterCode = (after as { referral_code?: string | null } | null)?.referral_code;
  if (isNumericReferralCode(afterCode)) return afterCode;
  return code;
}

export async function getRewardSettings(admin: AdminClient) {
  const keys = [
    "signup_reward_box_id",
    "signup_reward_box_amount",
    "referral_referrer_box_id",
    "referral_referrer_box_amount",
    "referral_referred_box_id",
    "referral_referred_box_amount",
  ];
  const { data } = await admin.from("site_settings").select("key,value").in("key", keys);
  const map = new Map((data ?? [] as SettingRow[]).map((row) => [row.key, typeof row.value === "string" ? row.value : String(row.value ?? "").replace(/^"|"$/g, "")]));
  const amount = (key: string, fallback: number) => {
    const parsed = Number(map.get(key) ?? fallback);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
  };
  return {
    signupBoxId: map.get("signup_reward_box_id") || null,
    signupBoxAmount: amount("signup_reward_box_amount", 1),
    referralReferrerBoxId: map.get("referral_referrer_box_id") || null,
    referralReferrerBoxAmount: amount("referral_referrer_box_amount", 0),
    referralReferredBoxId: map.get("referral_referred_box_id") || null,
    referralReferredBoxAmount: amount("referral_referred_box_amount", 0),
  };
}

async function rewardTargetName(admin: AdminClient, reward: RewardItem) {
  try {
    if (reward.type === "CURRENCY" && reward.currencyId) {
      const { data } = await admin.from("virtual_currencies").select("name,code,symbol").eq("id", reward.currencyId).maybeSingle();
      const row = data as { name?: string | null; code?: string | null; symbol?: string | null } | null;
      return row?.symbol || row?.code || row?.name || "화폐";
    }
    if (reward.type === "TICKET" && reward.drawId) {
      const { data } = await admin.from("draws").select("name").eq("id", reward.drawId).maybeSingle();
      const row = data as { name?: string | null } | null;
      return `${row?.name || "뽑기"} 추첨권`;
    }
    if (reward.type === "ITEM" && reward.rewardId) {
      const { data } = await admin.from("rewards").select("name").eq("id", reward.rewardId).maybeSingle();
      const row = data as { name?: string | null } | null;
      return row?.name || "상품";
    }
    if (reward.type === "RANDOM_BOX" && reward.boxId) {
      const { data } = await admin.from("random_boxes").select("name").eq("id", reward.boxId).maybeSingle();
      const row = data as { name?: string | null } | null;
      return row?.name || "랜덤박스";
    }
  } catch {
    // 이름 조회 실패 시 아래 기본 문구로 표시합니다.
  }
  if (reward.type === "CURRENCY") return "화폐";
  if (reward.type === "TICKET") return "추첨권";
  if (reward.type === "ITEM") return "상품";
  if (reward.type === "RANDOM_BOX") return "랜덤박스";
  if (reward.type === "EXP") return "경험치";
  return "보상";
}

async function enrichRewardItem(admin: AdminClient, reward: RewardItem, amount: number): Promise<RewardItem> {
  const targetName = await rewardTargetName(admin, reward);
  const memo = reward.label?.trim();
  let displayLabel = "";
  if (reward.type === "CURRENCY") displayLabel = `${targetName} ${amount.toLocaleString()}`;
  else if (reward.type === "TICKET") displayLabel = `${targetName} ${amount.toLocaleString()}장`;
  else if (reward.type === "ITEM") displayLabel = `${targetName} ${amount.toLocaleString()}개`;
  else if (reward.type === "RANDOM_BOX") displayLabel = `${targetName} ${amount.toLocaleString()}개`;
  else if (reward.type === "EXP") displayLabel = `${amount.toLocaleString()} EXP`;
  else displayLabel = `${targetName} ${amount.toLocaleString()}`;

  if (memo && memo !== targetName && !displayLabel.includes(memo)) {
    displayLabel = `${displayLabel} · ${memo}`;
  }
  return { ...reward, amount, displayLabel, displayName: displayLabel, name: displayLabel };
}

async function getBalance(admin: AdminClient, profileId: string, currencyId: string) {
  const { data } = await admin.from("currency_balances").select("balance").eq("profile_id", profileId).eq("currency_id", currencyId).maybeSingle();
  return Number((data as { balance?: number } | null)?.balance ?? 0);
}

export async function deliverRewards(options: DeliveryOptions) {
  const { admin, profileId, sourceType, sourceId = null, createdBy = null } = options;
  const rewards = cleanRewards(options.rewards);
  const delivered: RewardItem[] = [];
  for (const reward of rewards) {
    const amount = Math.max(1, Math.floor(reward.amount ?? 1));
    if (reward.type === "CURRENCY" && reward.currencyId) {
      const before = await getBalance(admin, profileId, reward.currencyId);
      const after = before + amount;
      const { error } = await admin.from("currency_balances").upsert({ profile_id: profileId, currency_id: reward.currencyId, balance: after, updated_at: new Date().toISOString() }, { onConflict: "profile_id,currency_id" });
      if (!error) {
        await admin.from("currency_logs").insert({ profile_id: profileId, currency_id: reward.currencyId, amount, action: sourceType, memo: options.memo ?? reward.label ?? "보상 지급", balance_after: after, created_by: createdBy, ip_address: options.ip ?? "system", user_agent: options.userAgent ?? "system" });
        delivered.push(await enrichRewardItem(admin, reward, amount));
      }
    }
    if (reward.type === "TICKET" && reward.drawId) {
      const { data: existing } = await admin.from("draw_tickets").select("quantity").eq("profile_id", profileId).eq("draw_id", reward.drawId).maybeSingle();
      const next = Number((existing as { quantity?: number } | null)?.quantity ?? 0) + amount;
      const { error } = await admin.from("draw_tickets").upsert({ profile_id: profileId, draw_id: reward.drawId, quantity: next, updated_at: new Date().toISOString() }, { onConflict: "profile_id,draw_id" });
      if (!error) {
        await admin.rpc("append_admin_log", { p_admin_id: createdBy ?? profileId, p_action: "REWARD_DRAW_TICKET_GRANTED", p_target_table: "draw_tickets", p_target_id: profileId, p_details: { profileId, drawId: reward.drawId, quantityAdded: amount, quantityAfter: next, sourceType, sourceId }, p_ip: options.ip ?? "system", p_user_agent: options.userAgent ?? "system" });
        delivered.push(await enrichRewardItem(admin, reward, amount));
      }
    }
    if (reward.type === "ITEM" && reward.rewardId) {
      const { data: existing } = await admin.from("participant_items").select("quantity").eq("profile_id", profileId).eq("reward_id", reward.rewardId).maybeSingle();
      const next = Number((existing as { quantity?: number } | null)?.quantity ?? 0) + amount;
      const { error } = await admin.from("participant_items").upsert({ profile_id: profileId, reward_id: reward.rewardId, quantity: next, updated_at: new Date().toISOString() }, { onConflict: "profile_id,reward_id" });
      if (!error) delivered.push(await enrichRewardItem(admin, reward, amount));
    }
    if (reward.type === "RANDOM_BOX" && reward.boxId) {
      const { data: existing } = await admin.from("user_random_boxes").select("quantity").eq("profile_id", profileId).eq("box_id", reward.boxId).maybeSingle();
      const next = Number((existing as { quantity?: number } | null)?.quantity ?? 0) + amount;
      const { error } = await admin.from("user_random_boxes").upsert({ profile_id: profileId, box_id: reward.boxId, quantity: next, source: sourceType, updated_at: new Date().toISOString() }, { onConflict: "profile_id,box_id" });
      if (!error) delivered.push(await enrichRewardItem(admin, reward, amount));
    }
    if (reward.type === "EXP") {
      const { error } = await admin.rpc("add_profile_exp", {
        p_profile_id: profileId,
        p_amount: amount,
        p_reason: options.memo ?? reward.label ?? "보상 EXP 지급",
        p_source_type: sourceType,
        p_source_id: String(sourceId ?? `${sourceType}:${Date.now()}`),
        p_created_by: createdBy,
      });
      if (!error) delivered.push(await enrichRewardItem(admin, reward, amount));
    }
  }

  if (delivered.length) {
    await admin.from("reward_delivery_logs").insert({ profile_id: profileId, source_type: sourceType, source_id: sourceId, rewards: delivered, created_by: createdBy });
    await createNotification(admin, profileId, options.notifyTitle ?? "보상이 지급되었습니다", options.notifyBody ?? rewardSummary(delivered), "REWARD", "/rewards");
  }
  return delivered;
}

export function rewardSummary(rewards: RewardItem[]) {
  if (!rewards.length) return "지급된 보상이 없습니다.";
  return rewards.map((reward) => {
    const direct = reward.displayLabel || reward.displayName || reward.name;
    if (direct) return direct;
    const amount = reward.amount ?? 1;
    if (reward.type === "CURRENCY") return `화폐 ${amount.toLocaleString()}`;
    if (reward.type === "TICKET") return `추첨권 ${amount.toLocaleString()}장`;
    if (reward.type === "ITEM") return `상품 ${amount.toLocaleString()}개`;
    if (reward.type === "RANDOM_BOX") return `랜덤박스 ${amount.toLocaleString()}개`;
    if (reward.type === "EXP") return `${amount.toLocaleString()} EXP`;
    return `보상 ${amount.toLocaleString()}`;
  }).join(" · ");
}

export async function createNotification(admin: AdminClient, profileId: string, title: string, body: string, type = "INFO", linkUrl: string | null = null) {
  await admin.from("notifications").insert({ profile_id: profileId, title, body, type, link_url: linkUrl });
}

async function wasRewardDelivered(admin: AdminClient, profileId: string, sourceType: string, sourceId: string | null | undefined) {
  const { count } = await admin.from("reward_delivery_logs").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("source_type", sourceType).eq("source_id", sourceId ?? null);
  return (count ?? 0) > 0;
}

export async function grantBox(admin: AdminClient, profileId: string, boxId: string | null | undefined, sourceType: string, createdBy?: string | null) {
  return grantBoxQuantity(admin, profileId, boxId, 1, sourceType, createdBy);
}

export async function grantBoxQuantity(
  admin: AdminClient,
  profileId: string,
  boxId: string | null | undefined,
  amount: number,
  sourceType: string,
  createdBy?: string | null,
  sourceId?: string | null,
) {
  const quantity = Math.max(0, Math.floor(amount || 0));
  if (!boxId || quantity < 1) return [];
  const deliverySourceId = sourceId ?? boxId;
  const alreadyDelivered = await wasRewardDelivered(admin, profileId, sourceType, deliverySourceId);
  if (alreadyDelivered) return [];
  return deliverRewards({ admin, profileId, rewards: [{ type: "RANDOM_BOX", boxId, amount: quantity, label: "랜덤박스" }], sourceType, sourceId: deliverySourceId, createdBy, notifyTitle: "랜덤박스가 지급되었습니다", notifyBody: "보상 센터에서 랜덤박스를 개봉할 수 있습니다." });
}

export async function handleApprovalRewards(admin: AdminClient, approvedProfileId: string, adminId: string) {
  const { data: profile } = await admin.from("profiles").select("id,display_name,username,referral_code,referred_by").eq("id", approvedProfileId).maybeSingle<ProfileLite>();
  if (!profile) return;
  await ensureReferralCode(admin, profile);
  const settings = await getRewardSettings(admin);
  await grantBoxQuantity(admin, profile.id, settings.signupBoxId, settings.signupBoxAmount, "SIGNUP_APPROVAL", adminId, `signup:${profile.id}`);

  if (profile.referred_by) {
    const { data: referrer } = await admin.from("profiles").select("id,display_name,username,referral_code").eq("id", profile.referred_by).maybeSingle<ProfileLite>();
    if (referrer && referrer.id !== profile.id) {
      const now = new Date().toISOString();
      const { data: existing } = await admin.from("referral_logs").select("id,referrer_rewarded_at,referred_rewarded_at").eq("referred_profile_id", profile.id).maybeSingle();
      let referralLogId = (existing as { id?: string } | null)?.id ?? null;
      if (!existing) {
        const { data: inserted } = await admin.from("referral_logs").insert({ referrer_id: referrer.id, referred_profile_id: profile.id, referral_code: referrer.referral_code, status: "APPROVED", approved_at: now }).select("id").single();
        referralLogId = (inserted as { id?: string } | null)?.id ?? null;
      } else {
        await admin.from("referral_logs").update({ status: "APPROVED", approved_at: now }).eq("id", (existing as { id: string }).id);
      }
      const referredSourceId = referralLogId ? `referral-referred:${referralLogId}` : `referral-referred:${profile.id}`;
      const referrerSourceId = referralLogId ? `referral-referrer:${referralLogId}` : `referral-referrer:${profile.id}`;
      const referrerDelivered = await grantBoxQuantity(admin, referrer.id, settings.referralReferrerBoxId, settings.referralReferrerBoxAmount, "REFERRAL_REFERRER_REWARD", adminId, referrerSourceId);
      const referredDelivered = await grantBoxQuantity(admin, profile.id, settings.referralReferredBoxId, settings.referralReferredBoxAmount, "REFERRAL_REFERRED_REWARD", adminId, referredSourceId);
      const updatePayload: Record<string, string> = { status: "APPROVED", approved_at: now };
      if (referrerDelivered.length) updatePayload.referrer_rewarded_at = now;
      if (referredDelivered.length) updatePayload.referred_rewarded_at = now;
      await admin.from("referral_logs").update(updatePayload).eq("referred_profile_id", profile.id);
      if (referrerDelivered.length) {
        await createNotification(admin, referrer.id, "추천 보상이 지급되었습니다", `${profile.display_name ?? "회원"}님이 승인되어 추천 보상을 받았습니다.`, "REFERRAL", "/rewards");
      }
    }
  }
}

export async function chooseRandomBoxReward(admin: AdminClient, boxId: string) {
  const { data } = await admin
    .from("random_box_rewards")
    .select("id,reward_type,amount,currency_id,draw_id,reward_id,random_box_id,label,probability_units")
    .eq("box_id", boxId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const rows = ((data ?? []) as BoxRewardRow[]).filter((row) => row.probability_units > 0);
  const total = rows.reduce((sum, row) => sum + row.probability_units, 0);
  if (!rows.length || total <= 0) return null;
  const roll = randomInt(total);
  let cursor = 0;
  for (const row of rows) {
    cursor += row.probability_units;
    if (roll < cursor) {
      return {
        row,
        reward: {
          type: row.reward_type,
          amount: row.amount,
          currencyId: row.currency_id ?? undefined,
          drawId: row.draw_id ?? undefined,
          rewardId: row.reward_id ?? undefined,
          boxId: row.random_box_id ?? undefined,
          label: row.label ?? undefined,
        } satisfies RewardItem,
      };
    }
  }
  const row = rows[rows.length - 1];
  return { row, reward: { type: row.reward_type, amount: row.amount, currencyId: row.currency_id ?? undefined, drawId: row.draw_id ?? undefined, rewardId: row.reward_id ?? undefined, boxId: row.random_box_id ?? undefined, label: row.label ?? undefined } satisfies RewardItem };
}
