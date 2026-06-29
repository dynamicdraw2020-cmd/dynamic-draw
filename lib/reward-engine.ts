import { createHash, randomInt } from "crypto";
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
  const digest = createHash("sha1").update(seed).digest("hex").slice(0, 6).toUpperCase();
  const readable = seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "USER";
  return `DD${readable}${digest}`.slice(0, 18);
}

export async function ensureReferralCode(admin: AdminClient, profile: ProfileLite) {
  if (profile.referral_code) return profile.referral_code;
  const base = profile.username || profile.display_name || profile.id;
  for (let i = 0; i < 4; i += 1) {
    const code = i === 0 ? makeReferralCode(base) : makeReferralCode(`${base}-${i}-${profile.id}`);
    const { error } = await admin.from("profiles").update({ referral_code: code }).eq("id", profile.id);
    if (!error) return code;
  }
  const fallback = `DD${profile.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  await admin.from("profiles").update({ referral_code: fallback }).eq("id", profile.id);
  return fallback;
}

export async function getRewardSettings(admin: AdminClient) {
  const keys = ["signup_reward_box_id", "referral_referrer_box_id", "referral_referred_box_id"];
  const { data } = await admin.from("site_settings").select("key,value").in("key", keys);
  const map = new Map((data ?? [] as SettingRow[]).map((row) => [row.key, typeof row.value === "string" ? row.value : String(row.value ?? "").replace(/^"|"$/g, "")]));
  return {
    signupBoxId: map.get("signup_reward_box_id") || null,
    referralReferrerBoxId: map.get("referral_referrer_box_id") || null,
    referralReferredBoxId: map.get("referral_referred_box_id") || null,
  };
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
        delivered.push({ ...reward, amount });
      }
    }
    if (reward.type === "TICKET" && reward.drawId) {
      const { data: existing } = await admin.from("draw_tickets").select("quantity").eq("profile_id", profileId).eq("draw_id", reward.drawId).maybeSingle();
      const next = Number((existing as { quantity?: number } | null)?.quantity ?? 0) + amount;
      const { error } = await admin.from("draw_tickets").upsert({ profile_id: profileId, draw_id: reward.drawId, quantity: next, updated_at: new Date().toISOString() }, { onConflict: "profile_id,draw_id" });
      if (!error) {
        await admin.rpc("append_admin_log", { p_admin_id: createdBy ?? profileId, p_action: "REWARD_DRAW_TICKET_GRANTED", p_target_table: "draw_tickets", p_target_id: profileId, p_details: { profileId, drawId: reward.drawId, quantityAdded: amount, quantityAfter: next, sourceType, sourceId }, p_ip: options.ip ?? "system", p_user_agent: options.userAgent ?? "system" });
        delivered.push({ ...reward, amount });
      }
    }
    if (reward.type === "ITEM" && reward.rewardId) {
      const { data: existing } = await admin.from("participant_items").select("quantity").eq("profile_id", profileId).eq("reward_id", reward.rewardId).maybeSingle();
      const next = Number((existing as { quantity?: number } | null)?.quantity ?? 0) + amount;
      const { error } = await admin.from("participant_items").upsert({ profile_id: profileId, reward_id: reward.rewardId, quantity: next, updated_at: new Date().toISOString() }, { onConflict: "profile_id,reward_id" });
      if (!error) delivered.push({ ...reward, amount });
    }
    if (reward.type === "RANDOM_BOX" && reward.boxId) {
      const { data: existing } = await admin.from("user_random_boxes").select("quantity").eq("profile_id", profileId).eq("box_id", reward.boxId).maybeSingle();
      const next = Number((existing as { quantity?: number } | null)?.quantity ?? 0) + amount;
      const { error } = await admin.from("user_random_boxes").upsert({ profile_id: profileId, box_id: reward.boxId, quantity: next, source: sourceType, updated_at: new Date().toISOString() }, { onConflict: "profile_id,box_id" });
      if (!error) delivered.push({ ...reward, amount });
    }
    if (reward.type === "EXP") {
      await admin.from("reward_delivery_logs").insert({ profile_id: profileId, source_type: "EXP_PLACEHOLDER", source_id: sourceId, rewards: [reward], created_by: createdBy });
      delivered.push({ ...reward, amount });
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
  return rewards.map((reward) => `${reward.label ?? reward.type} ${reward.amount ?? 1}`).join(" · ");
}

export async function createNotification(admin: AdminClient, profileId: string, title: string, body: string, type = "INFO", linkUrl: string | null = null) {
  await admin.from("notifications").insert({ profile_id: profileId, title, body, type, link_url: linkUrl });
}

export async function grantBox(admin: AdminClient, profileId: string, boxId: string | null | undefined, sourceType: string, createdBy?: string | null) {
  if (!boxId) return [];
  return deliverRewards({ admin, profileId, rewards: [{ type: "RANDOM_BOX", boxId, amount: 1, label: "랜덤박스" }], sourceType, sourceId: boxId, createdBy, notifyTitle: "랜덤박스가 지급되었습니다", notifyBody: "보상 센터에서 랜덤박스를 개봉할 수 있습니다." });
}

export async function handleApprovalRewards(admin: AdminClient, approvedProfileId: string, adminId: string) {
  const { data: profile } = await admin.from("profiles").select("id,display_name,username,referral_code,referred_by").eq("id", approvedProfileId).maybeSingle<ProfileLite>();
  if (!profile) return;
  await ensureReferralCode(admin, profile);
  const settings = await getRewardSettings(admin);
  await grantBox(admin, profile.id, settings.signupBoxId, "SIGNUP_APPROVAL", adminId);

  if (profile.referred_by) {
    const { data: referrer } = await admin.from("profiles").select("id,display_name,username,referral_code").eq("id", profile.referred_by).maybeSingle<ProfileLite>();
    if (referrer && referrer.id !== profile.id) {
      const { data: existing } = await admin.from("referral_logs").select("id,referrer_rewarded_at,referred_rewarded_at").eq("referred_profile_id", profile.id).maybeSingle();
      if (!existing) {
        await admin.from("referral_logs").insert({ referrer_id: referrer.id, referred_profile_id: profile.id, referral_code: referrer.referral_code, status: "APPROVED", approved_at: new Date().toISOString() });
      } else {
        await admin.from("referral_logs").update({ status: "APPROVED", approved_at: new Date().toISOString() }).eq("id", (existing as { id: string }).id);
      }
      await grantBox(admin, referrer.id, settings.referralReferrerBoxId, "REFERRAL_REFERRER_REWARD", adminId);
      await grantBox(admin, profile.id, settings.referralReferredBoxId, "REFERRAL_REFERRED_REWARD", adminId);
      await admin.from("referral_logs").update({ referrer_rewarded_at: new Date().toISOString(), referred_rewarded_at: new Date().toISOString() }).eq("referred_profile_id", profile.id);
      await createNotification(admin, referrer.id, "추천 보상이 지급되었습니다", `${profile.display_name ?? "회원"}님이 승인되어 추천 보상을 받았습니다.`, "REFERRAL", "/rewards");
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
