import { demoMode, supabaseConfigured } from "@/lib/env";
import {
  mockDraw,
  mockExchangeRules,
  mockInventory,
  mockResults,
  mockStats,
} from "@/lib/mock-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureReferralCode, isNumericReferralCode } from "@/lib/reward-engine";
import type {
  Draw,
  DrawResult,
  DrawTicket,
  UserDrawTicket,
  UserCurrencyBalance,
  UserTicketExchangeRate,
  AdminTicketBalance,
  AdminCurrencyBalance,
  TicketExchangeRate,
  VirtualCurrency,
  ExchangeRule,
  InventoryItem,
  Profile,
  PublicStats,
  PublicSettings,
  Notice,
  EventPost,
  RaffleEvent,
  AdminRaffleEvent,
  UserResultRow,
  AdminUserActivityData,
  UserActivityEntry,
  ProductCatalogItem,
  AdminRewardSystemData,
  AttendanceLog,
  AttendanceRule,
  NotificationItem,
  PromoCode,
  RandomBox,
  RandomBoxReward,
  RewardCenterData,
  UserRandomBox,
  Reward,
} from "@/lib/types";

const emptyStats: PublicStats = {
  totalDraws: 0,
  todayDraws: 0,
  totalMembers: 0,
  rewardStats: [],
  dailyStats: [],
};

function normalizeProfileStatus(value: unknown): Profile["status"] {
  const status = String(value ?? "").trim().toUpperCase();
  if (["PENDING", "APPROVED", "REJECTED", "SUSPENDED", "DELETED"].includes(status)) return status as Profile["status"];
  // 오래된 DB에서 status가 비어 있던 기존 회원은 운영 복구를 위해 승인 회원으로 취급합니다.
  return "APPROVED";
}

function normalizeProfileRole(value: unknown): Profile["role"] {
  const role = String(value ?? "").trim().toUpperCase();
  if (["USER", "VIEWER", "CS_MANAGER", "MANAGER", "SUPER_ADMIN"].includes(role)) return role as Profile["role"];
  return "USER";
}

function normalizeProfileRow(row: Record<string, unknown>): Profile {
  return {
    ...(row as unknown as Profile),
    id: String(row.id ?? ""),
    email: String(row.email ?? row.username ?? ""),
    username: typeof row.username === "string" ? row.username : null,
    display_name: String(row.display_name ?? row.username ?? row.email ?? "회원"),
    phone: typeof row.phone === "string" ? row.phone : null,
    role: normalizeProfileRole(row.role),
    status: normalizeProfileStatus(row.status),
    member_code: typeof row.member_code === "string" ? row.member_code : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function getAdminProfileSnapshot(): Promise<Profile[]> {
  if (demoMode) return [];
  const admin = createAdminClient();
  const result = await admin.from("profiles").select("*").or("status.is.null,status.neq.DELETED").order("created_at", { ascending: false }).limit(10000);
  const fallback = result.error ? await admin.from("profiles").select("*").order("created_at", { ascending: false }).limit(10000) : result;
  return ((fallback.data ?? []) as Array<Record<string, unknown>>)
    .map(normalizeProfileRow)
    .filter((profile) => profile.id && profile.status !== "DELETED");
}

async function attachRewards(admin: ReturnType<typeof createAdminClient>, draws: Draw[]): Promise<Draw[]> {
  const drawIds = draws.map((draw) => draw.id).filter(Boolean);
  if (!drawIds.length) return draws.map((draw) => ({ ...draw, rewards: [] }));
  const { data } = await admin
    .from("rewards")
    .select("id,draw_id,product_catalog_id,name,description,image_url,color,probability_units,stock,is_inventory_item,is_exchange_material,is_active,sort_order,deleted_at")
    .in("draw_id", drawIds)
    .order("sort_order", { ascending: true });
  const rewardsByDraw = new Map<string, Draw["rewards"]>();
  for (const reward of (data ?? []) as NonNullable<Draw["rewards"]>) {
    if (reward.deleted_at || !reward.is_active) continue;
    const list = rewardsByDraw.get(reward.draw_id) ?? [];
    list.push(reward);
    rewardsByDraw.set(reward.draw_id, list);
  }
  return draws.map((draw) => ({ ...draw, rewards: rewardsByDraw.get(draw.id) ?? [] }));
}

async function getDrawMap(admin: ReturnType<typeof createAdminClient>, drawIds: string[]): Promise<Map<string, Draw>> {
  const uniqueIds = Array.from(new Set(drawIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map();
  const { data } = await admin
    .from("draws")
    .select("id,name,slug,description,status,animation_ms,is_public,created_at,deleted_at")
    .in("id", uniqueIds);
  const draws = await attachRewards(admin, ((data ?? []) as Draw[]).filter((draw) => !draw.deleted_at));
  return new Map(draws.map((draw) => [draw.id, draw]));
}


export async function getPublicSettings(): Promise<PublicSettings> {
  const fallback = {
    siteName: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃",
    heroTitle: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃",
    heroDescription: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 Event server",
    publicStats: true,
  };
  if (!supabaseConfigured) return fallback;
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_settings").select("key,value").eq("is_public", true);
  if (error || !data) return fallback;
  for (const row of data) {
    if (row.key === "site_name") fallback.siteName = String(row.value);
    if (row.key === "hero_title") fallback.heroTitle = String(row.value);
    if (row.key === "hero_description") fallback.heroDescription = String(row.value);
    if (row.key === "public_stats") fallback.publicStats = Boolean(row.value);
  }
  return fallback;
}

export async function getPublicDraws(): Promise<Draw[]> {
  if (!supabaseConfigured) return [mockDraw];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("draws")
    .select("id,name,slug,description,status,animation_ms,is_public,created_at,deleted_at")
    .eq("is_public", true)
    .is("deleted_at", null)
    .in("status", ["ACTIVE", "PAUSED"])
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return attachRewards(admin, data as Draw[]);
}

export async function getPlayableDraws(profileId?: string): Promise<Draw[]> {
  if (!supabaseConfigured) return [mockDraw];
  const admin = createAdminClient();
  const visibleIds = new Set<string>();

  const { data: publicDraws } = await admin
    .from("draws")
    .select("id,name,slug,description,status,animation_ms,is_public,created_at,deleted_at")
    .eq("is_public", true)
    .is("deleted_at", null)
    .in("status", ["DRAFT", "ACTIVE", "PAUSED"])
    .order("created_at", { ascending: false });
  for (const draw of (publicDraws ?? []) as Draw[]) visibleIds.add(draw.id);

  const { data: rateRows } = await admin
    .from("ticket_exchange_rates")
    .select("draw_id")
    .eq("is_active", true)
    .is("deleted_at", null);
  for (const row of (rateRows ?? []) as Array<{ draw_id: string | null }>) if (row.draw_id) visibleIds.add(row.draw_id);

  if (profileId) {
    const { data: ticketRows } = await admin
      .from("draw_tickets")
      .select("draw_id")
      .eq("profile_id", profileId)
      .gt("quantity", 0);
    for (const row of (ticketRows ?? []) as Array<{ draw_id: string | null }>) if (row.draw_id) visibleIds.add(row.draw_id);
  }

  if (!visibleIds.size) return [];
  const { data, error } = await admin
    .from("draws")
    .select("id,name,slug,description,status,animation_ms,is_public,created_at,deleted_at")
    .in("id", Array.from(visibleIds))
    .is("deleted_at", null)
    .in("status", ["DRAFT", "ACTIVE", "PAUSED"]);
  if (error || !data) return [];
  const order: Record<Draw["status"], number> = { ACTIVE: 0, DRAFT: 1, PAUSED: 2, ENDED: 3 };
  const draws = await attachRewards(admin, data as Draw[]);
  return draws.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name, "ko"));
}

export async function getActiveDraw(): Promise<Draw | null> {
  const draws = await getPublicDraws();
  return draws.find((draw) => draw.status === "ACTIVE") ?? draws[0] ?? null;
}

export async function getPublicResults(limit = 30): Promise<DrawResult[]> {
  if (!supabaseConfigured) return mockResults.slice(0, limit);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_results")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as DrawResult[];
}

export async function getPublicStats(): Promise<PublicStats> {
  if (!supabaseConfigured) return mockStats;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_stats");
  if (error || !data) return emptyStats;
  return data as PublicStats;
}

export type PublicStatsByDrawRow = { drawId: string; drawName: string; total: number; rewards: Array<{ rewardId: string; name: string; color: string; count: number }> };

export async function getPublicStatsByDraw(): Promise<PublicStatsByDrawRow[]> {
  const [draws, results] = await Promise.all([getPublicDraws(), getPublicResults(300)]);
  return draws.map((draw) => {
    const drawResults = results.filter((result) => result.draw_id === draw.id);
    const knownRewards = (draw.rewards ?? []).map((reward) => ({ rewardId: reward.id, name: reward.name, color: reward.color, count: drawResults.filter((result) => result.reward_id === reward.id).length }));
    const extraRewards = drawResults.filter((result) => !(draw.rewards ?? []).some((reward) => reward.id === result.reward_id)).reduce<Array<{ rewardId: string; name: string; color: string; count: number }>>((acc, result) => {
      const existing = acc.find((item) => item.rewardId === result.reward_id);
      if (existing) existing.count += 1;
      else acc.push({ rewardId: result.reward_id, name: result.reward_name, color: result.reward_color, count: 1 });
      return acc;
    }, []);
    return { drawId: draw.id, drawName: draw.name, total: drawResults.length, rewards: [...knownRewards, ...extraRewards] };
  });
}

export async function getPublicDashboardData() {
  const [stats, draws, results, byDraw] = await Promise.all([getPublicStats(), getPublicDraws(), getPublicResults(160), getPublicStatsByDraw()]);
  return { stats, draws, results, recent: results, byDraw };
}

function kstDayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function lastSevenKstDays() {
  const todayKey = kstDayKey(new Date());
  const base = new Date(`${todayKey}T00:00:00+09:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base.getTime() - (6 - index) * 86400000);
    return kstDayKey(date);
  });
}

export async function getAdminStats(): Promise<PublicStats> {
  if (demoMode) return mockStats;
  const admin = createAdminClient();
  try {
    const [drawResult, rewardResult, resultResult, profileSnapshot] = await Promise.all([
      admin.from("draws").select("id,name,status,is_public,created_at,deleted_at").is("deleted_at", null).order("created_at", { ascending: false }),
      admin.from("rewards").select("id,draw_id,name,color,probability_units,is_active,sort_order,deleted_at").is("deleted_at", null).order("sort_order", { ascending: true }),
      admin.from("results").select("id,draw_id,reward_id,created_at,revealed_at,voided_at").not("revealed_at", "is", null).is("voided_at", null).order("created_at", { ascending: false }).limit(5000),
      getAdminProfileSnapshot(),
    ]);
    if (drawResult.error || rewardResult.error || resultResult.error) throw new Error("stats query failed");

    const draws = ((drawResult.data ?? []) as Array<{ id: string; name: string; status?: string | null; is_public?: boolean | null; created_at?: string | null; deleted_at?: string | null }>).filter((draw) => !draw.deleted_at);
    const rewards = ((rewardResult.data ?? []) as Array<{ id: string; draw_id: string; name: string; color?: string | null; probability_units?: number | null; is_active?: boolean | null; sort_order?: number | null; deleted_at?: string | null }>).filter((reward) => !reward.deleted_at && reward.is_active !== false);
    const results = ((resultResult.data ?? []) as Array<{ id: string; draw_id: string; reward_id: string; created_at: string; revealed_at: string | null; voided_at: string | null }>).filter((result) => result.revealed_at && !result.voided_at);

    const drawMap = new Map(draws.map((draw) => [draw.id, draw]));
    const drawTotals = new Map<string, number>();
    const rewardCounts = new Map<string, number>();
    const dailyCounts = new Map<string, number>();
    const dailyCountsByDraw = new Map<string, Map<string, number>>();

    for (const result of results) {
      if (!drawMap.has(result.draw_id)) continue;
      drawTotals.set(result.draw_id, (drawTotals.get(result.draw_id) ?? 0) + 1);
      rewardCounts.set(result.reward_id, (rewardCounts.get(result.reward_id) ?? 0) + 1);
      const day = kstDayKey(result.revealed_at ?? result.created_at);
      dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
      const drawDaily = dailyCountsByDraw.get(result.draw_id) ?? new Map<string, number>();
      drawDaily.set(day, (drawDaily.get(day) ?? 0) + 1);
      dailyCountsByDraw.set(result.draw_id, drawDaily);
    }

    const rewardStats = rewards
      .filter((reward) => drawMap.has(reward.draw_id))
      .map((reward) => {
        const draw = drawMap.get(reward.draw_id);
        const count = rewardCounts.get(reward.id) ?? 0;
        const drawTotal = drawTotals.get(reward.draw_id) ?? 0;
        return {
          rewardId: reward.id,
          drawId: reward.draw_id,
          drawName: draw?.name ?? "뽑기",
          name: reward.name,
          count,
          actualRate: drawTotal > 0 ? Number(((count * 100) / drawTotal).toFixed(2)) : 0,
          configuredRate: Number(((reward.probability_units ?? 0) / 10000).toFixed(4)),
          color: reward.color ?? "#38bdf8",
        };
      });

    const days = lastSevenKstDays();
    const dailyStats = [
      ...days.map((date) => ({ date: date.slice(5).replace("-", "/"), count: dailyCounts.get(date) ?? 0, drawId: "__ALL__" })),
      ...draws.flatMap((draw) => {
        const byDay = dailyCountsByDraw.get(draw.id) ?? new Map<string, number>();
        return days.map((date) => ({ date: date.slice(5).replace("-", "/"), count: byDay.get(date) ?? 0, drawId: draw.id }));
      }),
    ];

    const drawOptions = draws.map((draw) => ({ drawId: draw.id, drawName: draw.name, total: drawTotals.get(draw.id) ?? 0, status: draw.status ?? null }));
    const todayKey = kstDayKey(new Date());
    return {
      totalDraws: results.length,
      todayDraws: dailyCounts.get(todayKey) ?? 0,
      totalMembers: profileSnapshot.filter((profile) => profile.status === "APPROVED" && profile.role === "USER").length,
      rewardStats,
      dailyStats,
      drawOptions,
    };
  } catch {
    const { data, error } = await admin.rpc("get_admin_stats");
    if (error || !data) return emptyStats;
    return data as PublicStats;
  }
}

export async function getUserInventory(profileId: string): Promise<InventoryItem[]> {
  if (demoMode) return mockInventory;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participant_items")
    .select("reward_id, quantity, rewards(id,name,color,is_exchange_material,product_catalog_id)")
    .eq("profile_id", profileId)
    .gt("quantity", 0)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const grouped = new Map<string, InventoryItem>();
  for (const row of data) {
    const reward = Array.isArray(row.rewards) ? row.rewards[0] : row.rewards;
    const productId = reward?.product_catalog_id ?? null;
    const key = productId ? `product:${productId}` : `reward:${row.reward_id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += row.quantity;
      continue;
    }
    grouped.set(key, {
      reward_id: row.reward_id,
      canonical_reward_id: row.reward_id,
      product_catalog_id: productId,
      reward_name: reward?.name ?? "상품",
      reward_color: reward?.color ?? "#94a3b8",
      quantity: row.quantity,
      is_exchange_material: Boolean(reward?.is_exchange_material),
    });
  }
  return Array.from(grouped.values());
}

export async function getExchangeRules(): Promise<ExchangeRule[]> {
  if (!supabaseConfigured) return mockExchangeRules;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exchange_rules")
    .select(
      "id,name,source_reward_id,source_quantity,target_reward_id,target_quantity,is_active,source:rewards!exchange_rules_source_reward_id_fkey(name,product_catalog_id),target:rewards!exchange_rules_target_reward_id_fkey(name,product_catalog_id)",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => {
    const source = Array.isArray(row.source) ? row.source[0] : row.source;
    const target = Array.isArray(row.target) ? row.target[0] : row.target;
    return {
      id: row.id,
      name: row.name,
      source_reward_id: row.source_reward_id,
      source_reward_name: source?.name ?? "교환 재료",
      source_quantity: row.source_quantity,
      target_reward_id: row.target_reward_id,
      target_reward_name: target?.name ?? "교환 상품",
      target_quantity: row.target_quantity,
      is_active: row.is_active,
      source_product_catalog_id: source?.product_catalog_id ?? null,
      target_product_catalog_id: target?.product_catalog_id ?? null,
    };
  });
}

export async function getUserResults(profileId: string, limit = 20): Promise<UserResultRow[]> {
  if (demoMode) return mockResults.map((result) => ({
    id: result.id,
    created_at: result.created_at,
    revealed_at: result.revealed_at,
    voided_at: result.voided_at ?? null,
    draws: { name: result.draw_name },
    rewards: { name: result.reward_name, color: result.reward_color },
  }));
  const supabase = await createClient();
  const { data } = await supabase
    .from("results")
    .select("id,created_at,revealed_at,voided_at,draws(name),rewards(name,color)")
    .eq("participant_id", profileId)
    .not("revealed_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as UserResultRow[] | null) ?? [];
}


export async function getUserDrawTickets(profileId: string): Promise<UserDrawTicket[]> {
  if (demoMode) return [{ draw: mockDraw, quantity: 3 }];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("draw_tickets")
    .select("profile_id,draw_id,quantity,updated_at")
    .eq("profile_id", profileId)
    .gt("quantity", 0)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const ticketRows = data as DrawTicket[];
  const drawMap = await getDrawMap(admin, ticketRows.map((row) => row.draw_id));
  return ticketRows
    .map((row): UserDrawTicket | null => {
      const draw = drawMap.get(row.draw_id);
      if (!draw || draw.deleted_at || !draw.is_public || draw.status === "ENDED") return null;
      return { draw, quantity: row.quantity };
    })
    .filter((row): row is UserDrawTicket => Boolean(row));
}


export async function getUserCurrencyBalances(profileId: string): Promise<UserCurrencyBalance[]> {
  if (demoMode) return [{ currency: { id: "coin-demo", name: "이벤트 코인", code: "EVENT_COIN", symbol: "EC", is_active: true, sort_order: 10 }, balance: 500 }];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("currency_balances")
    .select("profile_id,currency_id,balance,updated_at")
    .eq("profile_id", profileId)
    .gt("balance", 0)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const rows = data as Array<{ currency_id: string; balance: number }>;
  const currencyIds = Array.from(new Set(rows.map((row) => row.currency_id).filter(Boolean)));
  if (!currencyIds.length) return [];
  const first = await admin
    .from("virtual_currencies")
    .select("id,name,code,symbol,is_active,sort_order,deleted_at")
    .in("id", currencyIds);
  const second = first.error
    ? await admin.from("virtual_currencies").select("id,name,code,symbol,is_active,sort_order").in("id", currencyIds)
    : first;
  const currencyMap = new Map(((second.data ?? []) as VirtualCurrency[]).map((currency) => [currency.id, currency]));
  return rows
    .map((row): UserCurrencyBalance | null => {
      const currency = currencyMap.get(row.currency_id);
      if (!currency || !currency.is_active || currency.deleted_at) return null;
      return { currency, balance: row.balance };
    })
    .filter((row): row is UserCurrencyBalance => Boolean(row));
}

export async function getUserTicketExchangeRates(): Promise<UserTicketExchangeRate[]> {
  if (demoMode) return [{ id: "rate-demo", draw: mockDraw, currency: { id: "coin-demo", name: "이벤트 코인", code: "EVENT_COIN", symbol: "EC", is_active: true, sort_order: 10 }, currencyCost: 100, ticketQuantity: 1 }];
  const admin = createAdminClient();

  // Supabase 프로젝트마다 deleted_at 보정 SQL 적용 시점이 다를 수 있어 1차 조회 실패 시
  // deleted_at 조건 없이 한 번 더 읽습니다. 화면 동기화가 빈 값으로 떨어지는 일을 막기 위함입니다.
  let rateRows: TicketExchangeRate[] = [];
  const first = await admin
    .from("ticket_exchange_rates")
    .select("id,draw_id,currency_id,currency_cost,ticket_quantity,is_active,sort_order,deleted_at")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (!first.error && first.data) {
    rateRows = first.data as TicketExchangeRate[];
  } else {
    const fallback = await admin
      .from("ticket_exchange_rates")
      .select("id,draw_id,currency_id,currency_cost,ticket_quantity,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    rateRows = (fallback.data as TicketExchangeRate[] | null) ?? [];
  }

  const rates = rateRows.filter((rate) => rate.is_active && !rate.deleted_at);
  if (!rates.length) return [];

  const drawMap = await getDrawMap(admin, rates.map((rate) => rate.draw_id));
  const currencyIds = Array.from(new Set(rates.map((rate) => rate.currency_id).filter(Boolean)));
  const currencyQuery = currencyIds.length
    ? await admin.from("virtual_currencies").select("id,name,code,symbol,is_active,sort_order,deleted_at").in("id", currencyIds)
    : { data: [] as VirtualCurrency[] | null, error: null };
  const currencyFallback = currencyQuery.error && currencyIds.length
    ? await admin.from("virtual_currencies").select("id,name,code,symbol,is_active,sort_order").in("id", currencyIds)
    : currencyQuery;
  const currencyMap = new Map(((currencyFallback.data ?? []) as VirtualCurrency[]).map((currency) => [currency.id, currency]));

  return rates
    .map((rate): UserTicketExchangeRate | null => {
      const draw = drawMap.get(rate.draw_id);
      const currency = currencyMap.get(rate.currency_id);
      if (!draw || !currency) return null;
      if (draw.deleted_at || draw.status === "ENDED") return null;
      if (currency.deleted_at || !currency.is_active) return null;
      return { id: rate.id, draw, currency, currencyCost: rate.currency_cost, ticketQuantity: rate.ticket_quantity };
    })
    .filter((row): row is UserTicketExchangeRate => Boolean(row));
}

export async function getAdminTicketBalances(): Promise<AdminTicketBalance[]> {
  if (demoMode) {
    return [{
      profile_id: "approved-1",
      draw_id: mockDraw.id,
      quantity: 3,
      profile_name: "승인 회원",
      profile_email: "member01",
      member_code: "DD-2026-000432",
      draw_name: mockDraw.name,
      updated_at: new Date().toISOString(),
    }];
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("draw_tickets")
    .select("profile_id,draw_id,quantity,updated_at,profiles(display_name,email,username,member_code),draws(name)")
    .gt("quantity", 0)
    .order("updated_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const draw = Array.isArray(row.draws) ? row.draws[0] : row.draws;
    return {
      profile_id: row.profile_id,
      draw_id: row.draw_id,
      quantity: row.quantity,
      profile_name: profile?.display_name ?? "회원",
      profile_email: profile?.username ?? profile?.email ?? "-",
      member_code: profile?.member_code ?? null,
      draw_name: draw?.name ?? "뽑기",
      updated_at: row.updated_at ?? null,
    };
  });
}


export async function getVirtualCurrencies(): Promise<VirtualCurrency[]> {
  if (demoMode) return [{ id: "coin-demo", name: "이벤트 코인", code: "EVENT_COIN", symbol: "EC", is_active: true, sort_order: 10 }];
  const admin = createAdminClient();
  const { data } = await admin.from("virtual_currencies").select("id,name,code,symbol,is_active,sort_order,deleted_at").is("deleted_at", null).order("sort_order", { ascending: true });
  return (data as VirtualCurrency[] | null) ?? [];
}

export async function getAdminCurrencyBalances(): Promise<AdminCurrencyBalance[]> {
  if (demoMode) return [{ profile_id: "approved-1", currency_id: "coin-demo", balance: 500, profile_name: "승인 회원", profile_email: "member01", member_code: "DD-2026-000432", currency_name: "이벤트 코인", currency_symbol: "EC", updated_at: new Date().toISOString() }];
  const admin = createAdminClient();
  const { data } = await admin.from("currency_balances").select("profile_id,currency_id,balance,updated_at,profiles(display_name,email,username,member_code),currency:virtual_currencies(name,symbol)").gt("balance", 0).order("updated_at", { ascending: false }).limit(500);
  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const currency = Array.isArray(row.currency) ? row.currency[0] : row.currency;
    return { profile_id: row.profile_id, currency_id: row.currency_id, balance: row.balance, profile_name: profile?.display_name ?? "회원", profile_email: profile?.username ?? profile?.email ?? "-", member_code: profile?.member_code ?? null, currency_name: currency?.name ?? "화폐", currency_symbol: currency?.symbol ?? "", updated_at: row.updated_at ?? null };
  });
}

export async function getAdminTicketExchangeRates(): Promise<Array<TicketExchangeRate & { draw_name?: string; currency_name?: string; currency_symbol?: string }>> {
  if (demoMode) return [{ id: "rate-demo", draw_id: mockDraw.id, currency_id: "coin-demo", currency_cost: 100, ticket_quantity: 1, is_active: true, sort_order: 10, draw_name: mockDraw.name, currency_name: "이벤트 코인", currency_symbol: "EC" }];
  const admin = createAdminClient();
  const { data } = await admin.from("ticket_exchange_rates").select("id,draw_id,currency_id,currency_cost,ticket_quantity,is_active,sort_order,deleted_at,draw:draws(name),currency:virtual_currencies(name,symbol)").is("deleted_at", null).order("sort_order", { ascending: true });
  return (data ?? []).map((row) => {
    const draw = Array.isArray(row.draw) ? row.draw[0] : row.draw;
    const currency = Array.isArray(row.currency) ? row.currency[0] : row.currency;
    return { id: row.id, draw_id: row.draw_id, currency_id: row.currency_id, currency_cost: row.currency_cost, ticket_quantity: row.ticket_quantity, is_active: row.is_active, sort_order: row.sort_order, deleted_at: row.deleted_at ?? null, draw_name: draw?.name ?? "뽑기", currency_name: currency?.name ?? "화폐", currency_symbol: currency?.symbol ?? "" };
  });
}



export async function getPublicNotices(limit = 5): Promise<Notice[]> {
  if (demoMode) return [];
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("notices")
    .select("id,title,body,is_pinned,is_public,starts_at,ends_at,created_at,updated_at")
    .eq("is_public", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as Notice[];
}

export async function getPublicEvents(limit = 12): Promise<EventPost[]> {
  if (demoMode) return [{ id: "event-demo", title: "입장권 교환 이벤트", slug: "ticket-event", summary: "추첨권으로 룰렛을 돌리고, 모은 입장권을 상품으로 교환하세요.", body: "이벤트 화폐와 추첨권은 실제 결제가 아닌 운영용 포인트입니다.", status: "ACTIVE", is_public: true, starts_at: null, ends_at: null, sort_order: 10, created_at: new Date().toISOString() }];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id,title,slug,summary,body,status,is_public,starts_at,ends_at,sort_order,created_at,updated_at")
    .eq("is_public", true)
    .in("status", ["ACTIVE", "ENDED"])
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as EventPost[];
}


export async function getPublicRaffles(limit = 8): Promise<RaffleEvent[]> {
  if (demoMode) {
    return [{ id: "raffle-demo", title: "본방 입장 추첨 이벤트", description: "공개 추첨 이벤트입니다.", prize_name: "본방 입장 우선권", status: "ACTIVE", is_public: true, starts_at: null, ends_at: null, winner_profile_id: null, winner_member_code: null, winner_display_name: null, executed_at: null, created_at: new Date().toISOString() }];
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("raffle_events").select("id,title,description,prize_name,status,is_public,starts_at,ends_at,required_member_tier_id,winner_profile_id,winner_member_code,winner_display_name,executed_at,created_at,updated_at").eq("is_public", true).in("status", ["ACTIVE", "COMPLETED"]).order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data as RaffleEvent[];
}

export async function getAdminRaffles(): Promise<AdminRaffleEvent[]> {
  if (demoMode) return [{ id: "raffle-demo", title: "본방 입장 추첨 이벤트", description: "공개 추첨 이벤트입니다.", prize_name: "본방 입장 우선권", status: "ACTIVE", is_public: true, starts_at: null, ends_at: null, winner_profile_id: null, winner_member_code: null, winner_display_name: null, executed_at: null, participant_count: 1, created_at: new Date().toISOString() }];
  const admin = createAdminClient();
  const [{ data }, { count }] = await Promise.all([
    admin.from("raffle_events").select("id,title,description,prize_name,status,is_public,starts_at,ends_at,required_member_tier_id,winner_profile_id,winner_member_code,winner_display_name,executed_at,created_at,updated_at").order("created_at", { ascending: false }).limit(200),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "APPROVED").eq("role", "USER"),
  ]);
  return ((data as RaffleEvent[] | null) ?? []).map((item) => ({ ...item, participant_count: count ?? 0 }));
}

export async function getAdminNotices(): Promise<Notice[]> {
  if (demoMode) return [];
  const admin = createAdminClient();
  const { data } = await admin.from("notices").select("id,title,body,is_pinned,is_public,starts_at,ends_at,created_at,updated_at").order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  return (data as Notice[] | null) ?? [];
}

export async function getAdminEvents(): Promise<EventPost[]> {
  if (demoMode) return [{ id: "event-demo", title: "입장권 교환 이벤트", slug: "ticket-event", summary: "이벤트 예시입니다.", body: "상세 설명", status: "ACTIVE", is_public: true, starts_at: null, ends_at: null, sort_order: 10, created_at: new Date().toISOString() }];
  const admin = createAdminClient();
  const { data } = await admin.from("events").select("id,title,slug,summary,body,status,is_public,starts_at,ends_at,sort_order,created_at,updated_at").order("sort_order", { ascending: true }).order("created_at", { ascending: false }).limit(200);
  return (data as EventPost[] | null) ?? [];
}

export async function getAdminDashboardData() {
  if (demoMode) {
    return {
      stats: mockStats,
      pendingMembers: 4,
      activeDraws: 1,
      recentResults: mockResults,
      recentLogs: [
        { id: "l1", action: "DRAW_EXECUTED", created_at: new Date().toISOString(), admin_name: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 관리자" },
        { id: "l2", action: "MEMBER_APPROVED", created_at: new Date(Date.now() - 3600000).toISOString(), admin_name: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 관리자" },
      ],
    };
  }
  const admin = createAdminClient();
  const [statsResult, profiles, activeDrawResult, resultsResult, logsResult] = await Promise.all([
    admin.rpc("get_admin_stats"),
    getAdminProfileSnapshot(),
    admin.from("draws").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    admin.from("public_results").select("*").order("created_at", { ascending: false }).limit(8),
    admin
      .from("admin_logs")
      .select("id,action,created_at,profiles!admin_logs_admin_id_fkey(display_name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return {
    stats: (statsResult.data as PublicStats | null) ?? emptyStats,
    pendingMembers: profiles.filter((profile) => profile.status === "PENDING").length,
    activeDraws: activeDrawResult.count ?? 0,
    recentResults: (resultsResult.data as DrawResult[] | null) ?? [],
    recentLogs:
      logsResult.data?.map((log) => {
        const profile = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
        return { ...log, admin_name: profile?.display_name ?? "관리자" };
      }) ?? [],
  };
}

export async function getAdminMembers(): Promise<Profile[]> {
  if (demoMode) {
    return [
      {
        id: "pending-1",
        email: "pending@dynamicdraw.local",
        username: "pending_user",
        display_name: "가입 대기 회원",
        phone: null,
        role: "USER",
        status: "PENDING",
        member_code: null,
        created_at: new Date().toISOString(),
        duplicate_risk_score: 45,
        duplicate_risk_flags: ["동일 IP 주의"],
        login_state: "OFFLINE",
      },
      {
        id: "approved-1",
        email: "demo@dynamicdraw.local",
        username: "demo",
        display_name: "승인 회원",
        phone: null,
        role: "USER",
        status: "APPROVED",
        member_code: "DD-2026-000432",
        created_at: new Date(Date.now() - 86400000).toISOString(),
        duplicate_risk_score: 0,
        duplicate_risk_flags: [],
        login_state: "ONLINE",
      },
    ];
  }
  const admin = createAdminClient();
  const profiles = await getAdminProfileSnapshot();
  if (!profiles.length) return profiles;
  const ids = profiles.map((profile) => profile.id);
  const [riskResult, sessionResult, attemptResult] = await Promise.all([
    admin.from("signup_risk_assessments").select("profile_id,risk_score,risk_flags,ip_address,browser_fingerprint,created_at").in("profile_id", ids).order("created_at", { ascending: false }),
    admin.from("member_session_status").select("profile_id,status,last_seen_at,last_login_at,last_logout_at,ip_address,browser_fingerprint").in("profile_id", ids),
    admin.from("login_activity_logs").select("profile_id,status,created_at,ip_address,browser_fingerprint").in("profile_id", ids).order("created_at", { ascending: false }).limit(1000),
  ]);
  const riskMap = new Map<string, { risk_score?: number | null; risk_flags?: string[] | null; ip_address?: string | null; browser_fingerprint?: string | null }>();
  for (const row of (riskResult.data ?? []) as Array<{ profile_id: string; risk_score?: number | null; risk_flags?: string[] | null; ip_address?: string | null; browser_fingerprint?: string | null }>) {
    if (!riskMap.has(row.profile_id)) riskMap.set(row.profile_id, row);
  }
  const sessionMap = new Map<string, { status?: string | null; last_seen_at?: string | null; ip_address?: string | null; browser_fingerprint?: string | null }>();
  for (const row of (sessionResult.data ?? []) as Array<{ profile_id: string; status?: string | null; last_seen_at?: string | null; ip_address?: string | null; browser_fingerprint?: string | null }>) {
    sessionMap.set(row.profile_id, row);
  }
  const attemptMap = new Map<string, { status?: string | null; created_at?: string | null }>();
  for (const row of (attemptResult.data ?? []) as Array<{ profile_id: string | null; status?: string | null; created_at?: string | null }>) {
    if (row.profile_id && !attemptMap.has(row.profile_id)) attemptMap.set(row.profile_id, row);
  }
  return profiles.map((profile) => {
    const risk = riskMap.get(profile.id);
    const session = sessionMap.get(profile.id);
    const attempt = attemptMap.get(profile.id);
    return {
      ...profile,
      duplicate_risk_score: risk?.risk_score ?? 0,
      duplicate_risk_flags: risk?.risk_flags ?? [],
      login_state: (session?.status ?? attempt?.status ?? "OFFLINE") as Profile["login_state"],
      last_login_attempt_at: attempt?.created_at ?? null,
      last_seen_at: session?.last_seen_at ?? null,
      ip_address: session?.ip_address ?? risk?.ip_address ?? null,
      browser_fingerprint: session?.browser_fingerprint ?? risk?.browser_fingerprint ?? null,
    };
  });
}

export async function getProductCatalog(): Promise<ProductCatalogItem[]> {
  if (demoMode) return [{ id: "product-demo", name: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 입장권", description: "전체 상품 보관함 예시", image_url: null, color: "#111111", default_stock: null, is_inventory_item: true, is_exchange_material: false, is_active: true, sort_order: 10 }];
  const admin = createAdminClient();
  const { data } = await admin.from("product_catalog").select("id,name,description,image_url,color,default_stock,is_inventory_item,is_exchange_material,is_active,sort_order,created_at,updated_at,deleted_at").is("deleted_at", null).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  return (data as ProductCatalogItem[] | null) ?? [];
}

export async function getAdminDraws(): Promise<Draw[]> {
  if (demoMode) return [mockDraw];
  const admin = createAdminClient();
  const { data } = await admin
    .from("draws")
    .select("*, rewards(*)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("sort_order", { referencedTable: "rewards", ascending: true });
  return (data as Draw[] | null) ?? [];
}

export async function getAdminExchangeRules() {
  if (demoMode) return mockExchangeRules;
  const admin = createAdminClient();
  const { data } = await admin
    .from("exchange_rules")
    .select(
      "id,name,source_reward_id,source_quantity,target_reward_id,target_quantity,is_active,sort_order,source:rewards!exchange_rules_source_reward_id_fkey(name),target:rewards!exchange_rules_target_reward_id_fkey(name)",
    )
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function getAdminResults(limit = 100) {
  if (demoMode) return mockResults;
  const admin = createAdminClient();

  async function mapRawRows(rows: Array<Record<string, unknown>>) {
    if (!rows.length) return [];
    const drawIds = Array.from(new Set(rows.map((row) => String(row.draw_id ?? row.drawId ?? "")).filter(Boolean)));
    const rewardIds = Array.from(new Set(rows.map((row) => String(row.reward_id ?? row.rewardId ?? "")).filter(Boolean)));
    const profileIds = Array.from(new Set(rows.map((row) => String(row.participant_id ?? row.profile_id ?? row.profileId ?? "")).filter(Boolean)));

    const [drawResult, rewardResult, profileResult] = await Promise.all([
      drawIds.length ? admin.from("draws").select("id,name").in("id", drawIds) : Promise.resolve({ data: [] }),
      rewardIds.length ? admin.from("rewards").select("id,name,color").in("id", rewardIds) : Promise.resolve({ data: [] }),
      profileIds.length ? admin.from("profiles").select("id,display_name,username,member_code").in("id", profileIds) : Promise.resolve({ data: [] }),
    ]);

    const drawMap = new Map(((drawResult.data ?? []) as Array<{ id: string; name?: string | null }>).map((row) => [row.id, row]));
    const rewardMap = new Map(((rewardResult.data ?? []) as Array<{ id: string; name?: string | null; color?: string | null }>).map((row) => [row.id, row]));
    const profileMap = new Map(((profileResult.data ?? []) as Array<{ id: string; display_name?: string | null; username?: string | null; member_code?: string | null }>).map((row) => [row.id, row]));

    return rows.map((row) => {
      const drawId = String(row.draw_id ?? row.drawId ?? "");
      const rewardId = String(row.reward_id ?? row.rewardId ?? "");
      const profileId = String(row.participant_id ?? row.profile_id ?? row.profileId ?? "");
      const draw = drawMap.get(drawId);
      const reward = rewardMap.get(rewardId);
      const profile = profileMap.get(profileId);
      return {
        ...row,
        id: row.id,
        created_at: row.created_at ?? row.createdAt ?? new Date().toISOString(),
        revealed_at: row.revealed_at ?? row.revealedAt ?? null,
        voided_at: row.voided_at ?? row.voidedAt ?? null,
        void_reason: row.void_reason ?? row.voidReason ?? null,
        public_display_name: row.public_display_name ?? row.publicDisplayName ?? row.participant_name ?? null,
        public_member_code: row.public_member_code ?? row.publicMemberCode ?? row.member_code ?? null,
        draws: draw ? { name: draw.name ?? "-" } : row.draw_name ? { name: row.draw_name } : null,
        rewards: reward ? { name: reward.name ?? "-", color: reward.color ?? "#111827" } : row.reward_name ? { name: row.reward_name, color: row.reward_color ?? "#111827" } : null,
        profiles: profile ? { display_name: profile.display_name ?? profile.username ?? "회원", member_code: profile.member_code ?? null } : null,
      };
    });
  }

  const rawResult = await admin
    .from("results")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!rawResult.error && rawResult.data?.length) {
    return mapRawRows((rawResult.data ?? []) as Array<Record<string, unknown>>);
  }

  const publicResult = await admin
    .from("public_results")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!publicResult.error && publicResult.data?.length) {
    return mapRawRows((publicResult.data ?? []) as Array<Record<string, unknown>>);
  }

  const relationFallback = await admin
    .from("results")
    .select("id,created_at,revealed_at,voided_at,void_reason,public_display_name,public_member_code,draws(name),rewards(name,color),profiles(display_name,member_code)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return relationFallback.data ?? [];
}

export async function getAdminLogs(limit = 100) {
  if (demoMode) {
    return [
      { id: "log-1", action: "DRAW_EXECUTED", target_table: "results", target_id: "r1", created_at: new Date().toISOString(), ip_address: "127.0.0.1", entry_hash: "a9f0…demo", profiles: { display_name: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 관리자" } },
      { id: "log-2", action: "PROBABILITY_UPDATED", target_table: "draws", target_id: mockDraw.id, created_at: new Date(Date.now() - 7200000).toISOString(), ip_address: "127.0.0.1", entry_hash: "41cd…demo", profiles: { display_name: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 관리자" } },
    ];
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_logs")
    .select("*, profiles!admin_logs_admin_id_fkey(display_name,username,email)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export interface ProbabilityHistoryFilters {
  drawId?: string;
  adminId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function getProbabilityHistory(filters: ProbabilityHistoryFilters = {}) {
  if (demoMode) return [];
  const admin = createAdminClient();
  let query = admin
    .from("probability_history")
    .select("*, profiles!probability_history_admin_id_fkey(display_name), draws(name)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(filters.limit ?? 200, 1), 1000));
  if (filters.drawId) query = query.eq("draw_id", filters.drawId);
  if (filters.adminId) query = query.eq("admin_id", filters.adminId);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000+09:00`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999+09:00`);
  const { data } = await query;
  return data ?? [];
}


export interface AuditChainStatus {
  valid: boolean;
  checked: number;
  invalidSequence: number | null;
  reason: string | null;
}

export async function getAuditIntegrity(): Promise<{ adminLogs: AuditChainStatus; probabilityHistory: AuditChainStatus }> {
  if (demoMode) {
    return {
      adminLogs: { valid: true, checked: 2, invalidSequence: null, reason: null },
      probabilityHistory: { valid: true, checked: 0, invalidSequence: null, reason: null },
    };
  }
  const admin = createAdminClient();
  const [adminResult, probabilityResult] = await Promise.all([
    admin.rpc("verify_admin_log_chain"),
    admin.rpc("verify_probability_history_chain"),
  ]);
  const fallback: AuditChainStatus = { valid: false, checked: 0, invalidSequence: null, reason: "VERIFY_FAILED" };
  return {
    adminLogs: (adminResult.data as AuditChainStatus | null) ?? fallback,
    probabilityHistory: (probabilityResult.data as AuditChainStatus | null) ?? fallback,
  };
}

export async function getPublicEventBySlug(slug: string): Promise<EventPost | null> {
  if (demoMode) return (await getPublicEvents()).find((event) => event.slug === slug) ?? null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id,title,slug,summary,body,status,is_public,starts_at,ends_at,sort_order,created_at,updated_at")
    .eq("slug", slug)
    .eq("is_public", true)
    .in("status", ["ACTIVE", "ENDED"])
    .maybeSingle();
  if (error || !data) return null;
  return data as EventPost;
}

function activityLabel(action: string, details: Record<string, unknown>) {
  const drawName = typeof details.drawName === "string" ? details.drawName : "이벤트";
  const currencyName = typeof details.currencyName === "string" ? details.currencyName : "화폐";
  const rewardName = typeof details.rewardName === "string" ? details.rewardName : "상품";
  if (action === "DRAW_TICKETS_GRANTED") return { title: "추첨권 지급", description: `${drawName} 추첨권 ${details.quantityAdded ?? ""}장 지급` };
  if (action === "DRAW_TICKETS_BULK_GRANTED") return { title: "추첨권 전체 지급", description: `${drawName} 추첨권을 전체 승인 계정에 지급` };
  if (action === "ADMIN_DRAW_TICKET_CONSUMED" || action === "USER_SELF_DRAW_EXECUTED") return { title: "추첨권 사용", description: `${drawName} 추첨권 1장 사용` };
  if (action === "VIRTUAL_CURRENCY_GRANTED") return { title: "화폐 지급", description: `${currencyName} ${details.amountAdded ?? ""} 지급` };
  if (action === "VIRTUAL_CURRENCY_BULK_GRANTED") return { title: "화폐 전체 지급", description: `${currencyName}을 전체 승인 계정에 지급` };
  if (action === "USER_EXCHANGED_CURRENCY_TO_TICKETS") return { title: "화폐 교환", description: `${currencyName} 사용 후 ${drawName} 추첨권 ${details.ticketsAdded ?? ""}장 교환` };
  if (action === "EXCHANGE_COMPLETED") return { title: "상품 교환", description: `${rewardName} 교환 처리` };
  if (action === "DRAW_RESULT") return { title: "추첨 결과", description: `${drawName}에서 ${rewardName} 결과 공개` };
  if (action === "MEMBER_BULK_APPROVED" || action === "MEMBER_APPROVED") return { title: "회원 승인", description: "관리자가 회원가입을 승인했습니다." };
  return { title: action, description: "운영 로그" };
}

type ActivityTicketRow = { profile_id: string; draw_id: string; quantity: number; updated_at: string | null; profiles?: { display_name?: string | null; email?: string | null; username?: string | null; member_code?: string | null } | Array<{ display_name?: string | null; email?: string | null; username?: string | null; member_code?: string | null }> | null; draws?: { name?: string | null } | Array<{ name?: string | null }> | null };
type ActivityCurrencyRow = { profile_id: string; currency_id: string; balance: number; updated_at: string | null; profiles?: { display_name?: string | null; email?: string | null; username?: string | null; member_code?: string | null } | Array<{ display_name?: string | null; email?: string | null; username?: string | null; member_code?: string | null }> | null; currency?: { name?: string | null; symbol?: string | null } | Array<{ name?: string | null; symbol?: string | null }> | null };
type ActivityInventoryRow = { reward_id: string; quantity: number; rewards?: { name?: string | null; color?: string | null; is_exchange_material?: boolean | null } | Array<{ name?: string | null; color?: string | null; is_exchange_material?: boolean | null }> | null };
type ActivityLogRow = { id: string; action: string; target_table?: string | null; target_id: string | null; details: Record<string, unknown> | null; created_at: string };
type ActivityCurrencyLogRow = { id: string; action: string; amount: number; memo: string | null; balance_after: number; created_at: string; currency?: { name?: string | null; symbol?: string | null } | Array<{ name?: string | null; symbol?: string | null }> | null };
type ActivityExchangeLogRow = { id: string; source_quantity: number; target_quantity: number; created_at: string; source?: { name?: string | null } | Array<{ name?: string | null }> | null; target?: { name?: string | null } | Array<{ name?: string | null }> | null };
type ActivityResultRow = { id: string; created_at: string; revealed_at: string | null; voided_at: string | null; draws?: { name?: string | null } | Array<{ name?: string | null }> | null; rewards?: { name?: string | null; color?: string | null } | Array<{ name?: string | null; color?: string | null }> | null };

function detailMatchesProfile(details: Record<string, unknown>, profileId: string) {
  const keys = ["profileId", "participantId", "targetProfileId", "winnerProfileId", "approvedProfileId"];
  return keys.some((key) => details[key] === profileId);
}

export async function getAdminUserActivityData(profileId?: string): Promise<AdminUserActivityData> {
  if (demoMode) return { profile: null, tickets: [], currencies: [], inventory: mockInventory, activities: [] };
  if (!profileId) return { profile: null, tickets: [], currencies: [], inventory: [], activities: [] };
  const admin = createAdminClient();
  const [profileResult, ticketResult, currencyResult, inventoryResult, logResult, currencyLogResult, exchangeLogResult, resultResult] = await Promise.all([
    admin.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    admin.from("draw_tickets").select("profile_id,draw_id,quantity,updated_at,profiles(display_name,email,username,member_code),draws(name)").eq("profile_id", profileId).order("updated_at", { ascending: false }),
    admin.from("currency_balances").select("profile_id,currency_id,balance,updated_at,profiles(display_name,email,username,member_code),currency:virtual_currencies(name,symbol)").eq("profile_id", profileId).order("updated_at", { ascending: false }),
    admin.from("participant_items").select("reward_id,quantity,rewards(name,color,is_exchange_material)").eq("profile_id", profileId).gt("quantity", 0),
    admin.from("admin_logs").select("id,action,target_table,target_id,details,created_at").order("created_at", { ascending: false }).limit(600),
    admin.from("currency_logs").select("id,action,amount,memo,balance_after,created_at,currency:virtual_currencies(name,symbol)").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(160),
    admin.from("exchange_logs").select("id,source_quantity,target_quantity,created_at,source:rewards!exchange_logs_source_reward_id_fkey(name),target:rewards!exchange_logs_target_reward_id_fkey(name)").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(160),
    admin.from("results").select("id,created_at,revealed_at,voided_at,draws(name),rewards(name,color)").eq("participant_id", profileId).order("created_at", { ascending: false }).limit(160),
  ]);

  const profile = (profileResult.data as Profile | null) ?? null;
  const tickets = ((ticketResult.data ?? []) as ActivityTicketRow[]).map((row) => { const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; const d = Array.isArray(row.draws) ? row.draws[0] : row.draws; return { profile_id: row.profile_id, draw_id: row.draw_id, quantity: row.quantity, profile_name: p?.display_name ?? "회원", profile_email: p?.username ?? p?.email ?? "", profile_username: p?.username ?? null, member_code: p?.member_code ?? null, draw_name: d?.name ?? "뽑기", updated_at: row.updated_at ?? null }; }) as AdminTicketBalance[];
  const currencies = ((currencyResult.data ?? []) as ActivityCurrencyRow[]).map((row) => { const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; const c = Array.isArray(row.currency) ? row.currency[0] : row.currency; return { profile_id: row.profile_id, currency_id: row.currency_id, balance: row.balance, profile_name: p?.display_name ?? "회원", profile_email: p?.username ?? p?.email ?? "", profile_username: p?.username ?? null, member_code: p?.member_code ?? null, currency_name: c?.name ?? "화폐", currency_symbol: c?.symbol ?? "", updated_at: row.updated_at ?? null }; }) as AdminCurrencyBalance[];
  const inventory = ((inventoryResult.data ?? []) as ActivityInventoryRow[]).map((row) => { const r = Array.isArray(row.rewards) ? row.rewards[0] : row.rewards; return { reward_id: row.reward_id, reward_name: r?.name ?? "상품", reward_color: r?.color ?? "#94a3b8", quantity: row.quantity, is_exchange_material: Boolean(r?.is_exchange_material) }; }) as InventoryItem[];

  const adminActivities = ((logResult.data ?? []) as ActivityLogRow[])
    .filter((row) => { const details = (row.details ?? {}) as Record<string, unknown>; return row.target_id === profileId || detailMatchesProfile(details, profileId); })
    .map((row) => { const details = (row.details ?? {}) as Record<string, unknown>; const label = activityLabel(row.action, details); return { id: `admin-${row.id}`, created_at: row.created_at, action: row.action, title: label.title, description: label.description, amount: typeof details.quantityAdded === "number" ? details.quantityAdded : typeof details.amountAdded === "number" ? details.amountAdded : null }; }) as UserActivityEntry[];

  const currencyActivities = ((currencyLogResult.data ?? []) as ActivityCurrencyLogRow[]).map((row) => {
    const currency = Array.isArray(row.currency) ? row.currency[0] : row.currency;
    const sign = row.amount >= 0 ? "+" : "";
    return { id: `currency-${row.id}`, created_at: row.created_at, action: row.action, title: row.amount >= 0 ? "화폐 지급" : "화폐 사용", description: `${currency?.name ?? "화폐"} ${sign}${row.amount.toLocaleString()}${currency?.symbol ?? ""} · 잔액 ${row.balance_after.toLocaleString()}${currency?.symbol ?? ""}${row.memo ? ` · ${row.memo}` : ""}`, amount: row.amount };
  }) as UserActivityEntry[];

  const exchangeActivities = ((exchangeLogResult.data ?? []) as ActivityExchangeLogRow[]).map((row) => {
    const source = Array.isArray(row.source) ? row.source[0] : row.source;
    const target = Array.isArray(row.target) ? row.target[0] : row.target;
    return { id: `exchange-${row.id}`, created_at: row.created_at, action: "EXCHANGE_COMPLETED", title: "상품 교환", description: `${source?.name ?? "재료 상품"} ${row.source_quantity.toLocaleString()}개 → ${target?.name ?? "교환 상품"} ${row.target_quantity.toLocaleString()}개`, amount: row.target_quantity };
  }) as UserActivityEntry[];

  const resultActivities = ((resultResult.data ?? []) as ActivityResultRow[]).map((row) => {
    const draw = Array.isArray(row.draws) ? row.draws[0] : row.draws;
    const reward = Array.isArray(row.rewards) ? row.rewards[0] : row.rewards;
    return { id: `result-${row.id}`, created_at: row.revealed_at ?? row.created_at, action: "DRAW_RESULT", title: row.voided_at ? "추첨 결과 무효" : "추첨 결과", description: `${draw?.name ?? "이벤트"} · ${reward?.name ?? "상품"}${row.voided_at ? " · 무효 처리" : ""}`, amount: null };
  }) as UserActivityEntry[];

  const activities = [...adminActivities, ...currencyActivities, ...exchangeActivities, ...resultActivities]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 160);
  return { profile, tickets, currencies, inventory, activities };
}

export async function getRewardSystemAdminData(): Promise<AdminRewardSystemData> {
  const fallback: AdminRewardSystemData = { boxes: [], boxRewards: [], attendanceRules: [], promoCodes: [], members: [], draws: [], currencies: [], rewards: [], settings: { signupBoxId: null, signupBoxAmount: 1, referralReferrerBoxId: null, referralReferrerBoxAmount: 0, referralReferredBoxId: null, referralReferredBoxAmount: 0 } };
  if (demoMode) return fallback;
  const admin = createAdminClient();
  const [boxesResult, boxRewardsResult, attendanceRulesResult, promoCodesResult, members, draws, currencies, settingsResult, rewardsResult] = await Promise.all([
    admin.from("random_boxes").select("id,name,description,image_url,is_active,is_signup_reward,starts_at,ends_at,sort_order,created_at,deleted_at").is("deleted_at", null).order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    admin.from("random_box_rewards").select("id,box_id,reward_type,amount,probability_units,label,currency_id,draw_id,reward_id,random_box_id,is_active,sort_order,currency:virtual_currencies(name),draw:draws(name),reward:rewards(name),next_box:random_boxes!random_box_rewards_random_box_id_fkey(name)").order("sort_order", { ascending: true }),
    admin.from("attendance_reward_rules").select("id,name,rule_type,required_count,rewards,is_active,sort_order").order("sort_order", { ascending: true }),
    admin.from("promo_codes").select("id,code,name,description,code_type,target_mode,target_profile_id,target_role,event_id,starts_at,ends_at,max_uses,per_user_limit,used_count,rewards,is_active,created_at,deleted_at").is("deleted_at", null).order("created_at", { ascending: false }),
    getAdminMembers(),
    getAdminDraws(),
    getVirtualCurrencies(),
    admin.from("site_settings").select("key,value").in("key", ["signup_reward_box_id", "signup_reward_box_amount", "referral_referrer_box_id", "referral_referrer_box_amount", "referral_referred_box_id", "referral_referred_box_amount"]),
    admin.from("rewards").select("id,draw_id,name,description,image_url,color,probability_units,stock,is_inventory_item,is_exchange_material,is_active,sort_order,deleted_at").is("deleted_at", null).order("name", { ascending: true }),
  ]);
  const boxRewards = ((boxRewardsResult.data ?? []) as Array<RandomBoxReward & { currency?: { name?: string } | Array<{ name?: string }> | null; draw?: { name?: string } | Array<{ name?: string }> | null; reward?: { name?: string } | Array<{ name?: string }> | null; next_box?: { name?: string } | Array<{ name?: string }> | null }>).map((row) => {
    const currency = Array.isArray(row.currency) ? row.currency[0] : row.currency;
    const draw = Array.isArray(row.draw) ? row.draw[0] : row.draw;
    const reward = Array.isArray(row.reward) ? row.reward[0] : row.reward;
    const nextBox = Array.isArray(row.next_box) ? row.next_box[0] : row.next_box;
    return { ...row, currency_name: currency?.name ?? null, draw_name: draw?.name ?? null, reward_name: reward?.name ?? null, random_box_name: nextBox?.name ?? null } as RandomBoxReward;
  });
  const promoCodes = ((promoCodesResult.data ?? []) as Array<PromoCode & { target?: { display_name?: string; username?: string } | Array<{ display_name?: string; username?: string }> | null; event?: { title?: string } | Array<{ title?: string }> | null }>).map((row) => {
    const target = Array.isArray(row.target) ? row.target[0] : row.target;
    const event = Array.isArray(row.event) ? row.event[0] : row.event;
    return { ...row, target_profile_name: target?.display_name ?? target?.username ?? null, event_title: event?.title ?? null } as PromoCode;
  });
  const settingMap = new Map(((settingsResult.data ?? []) as Array<{ key: string; value: unknown }>).map((row) => [row.key, typeof row.value === "string" ? row.value : String(row.value ?? "").replace(/^"|"$/g, "")]));
  return {
    boxes: (boxesResult.data as RandomBox[] | null) ?? [],
    boxRewards,
    attendanceRules: (attendanceRulesResult.data as AttendanceRule[] | null) ?? [],
    promoCodes,
    members,
    draws,
    currencies,
    rewards: (rewardsResult.data as Reward[] | null) ?? [],
    settings: {
      signupBoxId: settingMap.get("signup_reward_box_id") || null,
      signupBoxAmount: Math.max(0, Number(settingMap.get("signup_reward_box_amount") || 1)),
      referralReferrerBoxId: settingMap.get("referral_referrer_box_id") || null,
      referralReferrerBoxAmount: Math.max(0, Number(settingMap.get("referral_referrer_box_amount") || 0)),
      referralReferredBoxId: settingMap.get("referral_referred_box_id") || null,
      referralReferredBoxAmount: Math.max(0, Number(settingMap.get("referral_referred_box_amount") || 0)),
    },
  };
}

function kstDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function getRewardCenterData(profile: Profile): Promise<RewardCenterData> {
  const fallback: RewardCenterData = { referral: { referralCode: profile.member_code, referredBy: null, totalApproved: 0 }, boxes: [], attendanceToday: null, recentAttendance: [], notifications: [], availablePromoCodes: [] };
  if (demoMode) return fallback;
  const admin = createAdminClient();
  const today = kstDateString();
  const [profileResult, referralCountResult, boxesResult, todayResult, recentResult, notificationsResult, promoCodesResult, promoUseResult] = await Promise.all([
    admin.from("profiles").select("referral_code,referred_by").eq("id", profile.id).maybeSingle(),
    admin.from("referral_logs").select("id", { count: "exact", head: true }).eq("referrer_id", profile.id).eq("status", "APPROVED"),
    admin.from("user_random_boxes").select("id,profile_id,box_id,quantity,source,updated_at,box:random_boxes(id,name,description,image_url,is_active,is_signup_reward,starts_at,ends_at,sort_order,created_at,deleted_at)").eq("profile_id", profile.id).gt("quantity", 0).order("updated_at", { ascending: false }),
    admin.from("attendance_logs").select("id,profile_id,attendance_date,source,streak_count,reward_snapshot,created_at").eq("profile_id", profile.id).eq("attendance_date", today).maybeSingle(),
    admin.from("attendance_logs").select("id,profile_id,attendance_date,source,streak_count,reward_snapshot,created_at").eq("profile_id", profile.id).order("attendance_date", { ascending: false }).limit(14),
    admin.from("notifications").select("id,profile_id,title,body,type,link_url,is_read,created_at").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(40),
    admin.from("promo_codes").select("id,code,name,description,code_type,target_mode,target_profile_id,target_role,event_id,starts_at,ends_at,max_uses,per_user_limit,used_count,rewards,is_active,created_at,deleted_at").eq("is_active", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(30),
    admin.from("promo_redemptions").select("promo_id").eq("profile_id", profile.id),
  ]);
  const p = profileResult.data as { referral_code?: string | null; referred_by?: string | null } | null;
  let referrer: { display_name?: string | null; username?: string | null } | null = null;
  if (p?.referred_by) {
    const { data: referrerRow } = await admin.from("profiles").select("display_name,username").eq("id", p.referred_by).maybeSingle();
    referrer = referrerRow as { display_name?: string | null; username?: string | null } | null;
  }
  const referralCode = isNumericReferralCode(p?.referral_code) && p?.referral_code?.length === 8
    ? p.referral_code
    : await ensureReferralCode(admin, {
      id: profile.id,
      display_name: profile.display_name,
      username: profile.username,
      referral_code: p?.referral_code ?? null,
      referred_by: p?.referred_by ?? null,
    });
  const boxes = ((boxesResult.data ?? []) as Array<UserRandomBox & { box?: RandomBox | RandomBox[] | null }>).map((row) => {
    const box = Array.isArray(row.box) ? row.box[0] : row.box;
    return { ...row, box_name: box?.name ?? "랜덤박스", box_description: box?.description ?? null, box_image_url: box?.image_url ?? null };
  });
  const now = new Date();
  const promoUseCounts = new Map<string, number>();
  for (const row of ((promoUseResult.data ?? []) as Array<{ promo_id: string }>)) {
    promoUseCounts.set(row.promo_id, (promoUseCounts.get(row.promo_id) ?? 0) + 1);
  }
  const availablePromoCodes = ((promoCodesResult.data ?? []) as PromoCode[]).filter((code) => {
    if (code.starts_at && new Date(code.starts_at) > now) return false;
    if (code.ends_at && new Date(code.ends_at) < now) return false;
    if (code.max_uses !== null && code.used_count >= code.max_uses) return false;
    if ((promoUseCounts.get(code.id) ?? 0) >= code.per_user_limit) return false;
    if (code.target_mode === "PROFILE" && code.target_profile_id !== profile.id) return false;
    if (code.target_mode === "ROLE" && code.target_role !== profile.role) return false;
    return true;
  });
  return {
    referral: { referralCode: referralCode ?? null, referredBy: referrer?.display_name ?? referrer?.username ?? null, totalApproved: referralCountResult.count ?? 0 },
    boxes,
    attendanceToday: (todayResult.data as AttendanceLog | null) ?? null,
    recentAttendance: (recentResult.data as AttendanceLog[] | null) ?? [],
    notifications: (notificationsResult.data as NotificationItem[] | null) ?? [],
    availablePromoCodes,
  };
}

export type PublicRankingEntry = {
  profileId: string;
  displayName: string;
  loginId: string;
  memberCode: string | null;
  levelNo: number;
  expTotal: number;
  gainedExp: number;
  weeklyDraws: number;
  attendanceCount: number;
  badges: Array<{ name: string; icon: string | null; labelColor: string | null }>;
};

function rankingProfileLabel(profile: { display_name?: string | null; username?: string | null; email?: string | null; member_code?: string | null } | null | undefined) {
  return {
    displayName: profile?.display_name ?? profile?.username ?? "회원",
    loginId: profile?.username ?? profile?.email ?? "",
    memberCode: profile?.member_code ?? null,
  };
}

function isPublicRankingProfile(profile: { role?: string | null; status?: string | null } | null | undefined) {
  return profile?.status === "APPROVED" && profile?.role === "USER";
}

export async function getPublicRankings(): Promise<{ level: PublicRankingEntry[]; attendance: PublicRankingEntry[]; weeklyDraws: PublicRankingEntry[] }> {
  if (demoMode) return { level: [], attendance: [], weeklyDraws: [] };
  const admin = createAdminClient();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [profilesResult, growthResult, expResult, attendanceResult, weeklyDrawResult, badgeResult] = await Promise.all([
    admin.from("profiles").select("id,display_name,username,email,member_code,role,status").eq("status", "APPROVED").eq("role", "USER").limit(5000),
    admin.from("profile_growth").select("profile_id,level_no,exp_total").order("level_no", { ascending: false }).order("exp_total", { ascending: false }).limit(5000),
    admin.from("exp_logs").select("profile_id,amount").gt("amount", 0).order("created_at", { ascending: false }).limit(5000),
    admin.from("attendance_logs").select("profile_id,attendance_date").order("attendance_date", { ascending: false }).limit(20000),
    admin.from("results").select("participant_id,created_at").gte("created_at", weekAgo).is("voided_at", null).limit(5000),
    admin.from("profile_badges").select("profile_id,badges(name,icon,label_color)").order("granted_at", { ascending: false }).limit(3000),
  ]);

  const profileMap = new Map<string, { display_name?: string | null; username?: string | null; email?: string | null; member_code?: string | null; role?: string | null; status?: string | null }>();
  for (const profile of (profilesResult.data ?? []) as Array<{ id: string; display_name?: string | null; username?: string | null; email?: string | null; member_code?: string | null; role?: string | null; status?: string | null }>) {
    profileMap.set(profile.id, profile);
  }

  const badgeMap = new Map<string, Array<{ name: string; icon: string | null; labelColor: string | null }>>();
  for (const row of (badgeResult.data ?? []) as Array<{ profile_id: string; badges?: { name?: string | null; icon?: string | null; label_color?: string | null } | Array<{ name?: string | null; icon?: string | null; label_color?: string | null }> | null }>) {
    const badge = Array.isArray(row.badges) ? row.badges[0] : row.badges;
    if (!badge?.name || !profileMap.has(row.profile_id)) continue;
    const list = badgeMap.get(row.profile_id) ?? [];
    if (list.length < 3) list.push({ name: badge.name, icon: badge.icon ?? null, labelColor: badge.label_color ?? null });
    badgeMap.set(row.profile_id, list);
  }

  const baseFromGrowth = new Map<string, PublicRankingEntry>();
  for (const row of (growthResult.data ?? []) as Array<{ profile_id: string; level_no: number; exp_total: number }>) {
    const profile = profileMap.get(row.profile_id);
    if (!isPublicRankingProfile(profile)) continue;
    const label = rankingProfileLabel(profile);
    baseFromGrowth.set(row.profile_id, {
      profileId: row.profile_id,
      displayName: label.displayName,
      loginId: label.loginId,
      memberCode: label.memberCode,
      levelNo: Number(row.level_no ?? 1),
      expTotal: Number(row.exp_total ?? 0),
      gainedExp: 0,
      weeklyDraws: 0,
      attendanceCount: 0,
      badges: badgeMap.get(row.profile_id) ?? [],
    });
  }

  for (const [profileId, profile] of profileMap) {
    if (!baseFromGrowth.has(profileId)) {
      const label = rankingProfileLabel(profile);
      baseFromGrowth.set(profileId, { profileId, displayName: label.displayName, loginId: label.loginId, memberCode: label.memberCode, levelNo: 1, expTotal: 0, gainedExp: 0, weeklyDraws: 0, attendanceCount: 0, badges: badgeMap.get(profileId) ?? [] });
    }
  }

  const expAgg = new Map<string, PublicRankingEntry>();
  for (const row of (expResult.data ?? []) as Array<{ profile_id: string; amount: number }>) {
    if (!profileMap.has(row.profile_id)) continue;
    const base = expAgg.get(row.profile_id) ?? baseFromGrowth.get(row.profile_id);
    if (!base) continue;
    expAgg.set(row.profile_id, { ...base, gainedExp: base.gainedExp + Number(row.amount ?? 0) });
  }


  const attendanceAgg = new Map<string, PublicRankingEntry>();
  for (const row of (attendanceResult.data ?? []) as Array<{ profile_id: string }>) {
    if (!profileMap.has(row.profile_id)) continue;
    const base = attendanceAgg.get(row.profile_id) ?? baseFromGrowth.get(row.profile_id);
    if (!base) continue;
    attendanceAgg.set(row.profile_id, { ...base, attendanceCount: base.attendanceCount + 1 });
  }

  const drawAgg = new Map<string, PublicRankingEntry>();
  for (const row of (weeklyDrawResult.data ?? []) as Array<{ participant_id: string }>) {
    if (!profileMap.has(row.participant_id)) continue;
    const base = drawAgg.get(row.participant_id) ?? baseFromGrowth.get(row.participant_id);
    if (!base) continue;
    drawAgg.set(row.participant_id, { ...base, weeklyDraws: base.weeklyDraws + 1 });
  }

  return {
    level: Array.from(baseFromGrowth.values()).sort((a, b) => b.levelNo - a.levelNo || b.expTotal - a.expTotal).slice(0, 5000),
    attendance: Array.from(attendanceAgg.values()).sort((a, b) => b.attendanceCount - a.attendanceCount || b.expTotal - a.expTotal).slice(0, 5000),
    weeklyDraws: Array.from(drawAgg.values()).sort((a, b) => b.weeklyDraws - a.weeklyDraws || b.expTotal - a.expTotal).slice(0, 5000),
  };
}

