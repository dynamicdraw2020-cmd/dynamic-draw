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
} from "@/lib/types";

const emptyStats: PublicStats = {
  totalDraws: 0,
  todayDraws: 0,
  totalMembers: 0,
  rewardStats: [],
  dailyStats: [],
};


export async function getPublicSettings(): Promise<PublicSettings> {
  const fallback = {
    siteName: "Dynamic D",
    heroTitle: "Dynamic D - 이벤트 전용 사이트",
    heroDescription: "Dynamic에서 주관하는 모든 뽑기(추첨)형 이벤트를 주관하는 사이트. Dynamic D - 누구보다 빠른 본방 입성을 향한 길.",
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("draws")
    .select("id,name,slug,description,status,animation_ms,is_public,created_at,rewards(id,draw_id,name,description,image_url,color,probability_units,is_inventory_item,is_exchange_material,is_active,sort_order)")
    .eq("is_public", true)
    .in("status", ["ACTIVE", "PAUSED"])
    .order("created_at", { ascending: false })
    .order("sort_order", { referencedTable: "rewards", ascending: true });
  if (error || !data) return [];
  return data as Draw[];
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

export async function getAdminStats(): Promise<PublicStats> {
  if (demoMode) return mockStats;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_admin_stats");
  if (error || !data) return emptyStats;
  return data as PublicStats;
}

export async function getUserInventory(profileId: string): Promise<InventoryItem[]> {
  if (demoMode) return mockInventory;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participant_items")
    .select("reward_id, quantity, rewards(name,color,is_exchange_material)")
    .eq("profile_id", profileId)
    .gt("quantity", 0)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => {
    const reward = Array.isArray(row.rewards) ? row.rewards[0] : row.rewards;
    return {
      reward_id: row.reward_id,
      reward_name: reward?.name ?? "상품",
      reward_color: reward?.color ?? "#94a3b8",
      quantity: row.quantity,
      is_exchange_material: Boolean(reward?.is_exchange_material),
    };
  });
}

export async function getExchangeRules(): Promise<ExchangeRule[]> {
  if (!supabaseConfigured) return mockExchangeRules;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exchange_rules")
    .select(
      "id,name,source_reward_id,source_quantity,target_reward_id,target_quantity,is_active,source:rewards!exchange_rules_source_reward_id_fkey(name),target:rewards!exchange_rules_target_reward_id_fkey(name)",
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("draw_tickets")
    .select("profile_id,draw_id,quantity,updated_at,draws(id,name,slug,description,status,animation_ms,is_public,created_at,rewards(id,draw_id,name,description,image_url,color,probability_units,is_inventory_item,is_exchange_material,is_active,sort_order))")
    .eq("profile_id", profileId)
    .gt("quantity", 0)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as DrawTicket[])
    .map((row) => {
      const draw = Array.isArray(row.draws) ? row.draws[0] : row.draws;
      return draw ? { draw, quantity: row.quantity } : null;
    })
    .filter((row): row is UserDrawTicket => Boolean(row));
}


export async function getUserCurrencyBalances(profileId: string): Promise<UserCurrencyBalance[]> {
  if (demoMode) return [{ currency: { id: "coin-demo", name: "이벤트 코인", code: "EVENT_COIN", symbol: "EC", is_active: true, sort_order: 10 }, balance: 500 }];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("currency_balances")
    .select("profile_id,currency_id,balance,updated_at,currency:virtual_currencies(id,name,code,symbol,is_active,sort_order)")
    .eq("profile_id", profileId)
    .gt("balance", 0)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as Array<{ balance: number; currency: VirtualCurrency | VirtualCurrency[] | null }>)
    .map((row) => { const currency = Array.isArray(row.currency) ? row.currency[0] : row.currency; return currency ? { currency, balance: row.balance } : null; })
    .filter((row): row is UserCurrencyBalance => Boolean(row));
}

export async function getUserTicketExchangeRates(): Promise<UserTicketExchangeRate[]> {
  if (demoMode) return [{ id: "rate-demo", draw: mockDraw, currency: { id: "coin-demo", name: "이벤트 코인", code: "EVENT_COIN", symbol: "EC", is_active: true, sort_order: 10 }, currencyCost: 100, ticketQuantity: 1 }];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_exchange_rates")
    .select("id,draw_id,currency_id,currency_cost,ticket_quantity,is_active,sort_order,draw:draws(id,name,slug,description,status,animation_ms,is_public,created_at,rewards(id,draw_id,name,description,image_url,color,probability_units,is_inventory_item,is_exchange_material,is_active,sort_order)),currency:virtual_currencies(id,name,code,symbol,is_active,sort_order)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as TicketExchangeRate[])
    .map((row) => {
      const draw = Array.isArray(row.draw) ? row.draw[0] : row.draw;
      const currency = Array.isArray(row.currency) ? row.currency[0] : row.currency;
      return draw && currency && draw.status === "ACTIVE" && currency.is_active ? { id: row.id, draw, currency, currencyCost: row.currency_cost, ticketQuantity: row.ticket_quantity } : null;
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
  const { data } = await admin.from("virtual_currencies").select("id,name,code,symbol,is_active,sort_order").order("sort_order", { ascending: true });
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
  const { data } = await admin.from("ticket_exchange_rates").select("id,draw_id,currency_id,currency_cost,ticket_quantity,is_active,sort_order,draw:draws(name),currency:virtual_currencies(name,symbol)").order("sort_order", { ascending: true });
  return (data ?? []).map((row) => {
    const draw = Array.isArray(row.draw) ? row.draw[0] : row.draw;
    const currency = Array.isArray(row.currency) ? row.currency[0] : row.currency;
    return { id: row.id, draw_id: row.draw_id, currency_id: row.currency_id, currency_cost: row.currency_cost, ticket_quantity: row.ticket_quantity, is_active: row.is_active, sort_order: row.sort_order, draw_name: draw?.name ?? "뽑기", currency_name: currency?.name ?? "화폐", currency_symbol: currency?.symbol ?? "" };
  });
}



export async function getPublicNotices(limit = 5): Promise<Notice[]> {
  if (demoMode) return [{ id: "notice-demo", title: "운영 안내", body: "모든 추첨 결과는 서버에서 먼저 결정되며, 화면의 룰렛은 연출용입니다.", is_pinned: true, is_public: true, starts_at: null, ends_at: null, created_at: new Date().toISOString() }];
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
    return [{ id: "raffle-demo", title: "전체 회원 본방 입장 추첨", description: "승인된 전체 회원을 대상으로 진행하는 공개 추첨 이벤트입니다.", prize_name: "본방 입장 우선권", status: "ACTIVE", is_public: true, starts_at: null, ends_at: null, winner_profile_id: null, winner_member_code: null, winner_display_name: null, executed_at: null, created_at: new Date().toISOString() }];
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("raffle_events").select("id,title,description,prize_name,status,is_public,starts_at,ends_at,winner_profile_id,winner_member_code,winner_display_name,executed_at,created_at,updated_at").eq("is_public", true).in("status", ["ACTIVE", "COMPLETED"]).order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data as RaffleEvent[];
}

export async function getAdminRaffles(): Promise<AdminRaffleEvent[]> {
  if (demoMode) return [{ id: "raffle-demo", title: "전체 회원 본방 입장 추첨", description: "승인된 전체 회원을 대상으로 진행하는 공개 추첨 이벤트입니다.", prize_name: "본방 입장 우선권", status: "ACTIVE", is_public: true, starts_at: null, ends_at: null, winner_profile_id: null, winner_member_code: null, winner_display_name: null, executed_at: null, participant_count: 1, created_at: new Date().toISOString() }];
  const admin = createAdminClient();
  const [{ data }, { count }] = await Promise.all([
    admin.from("raffle_events").select("id,title,description,prize_name,status,is_public,starts_at,ends_at,winner_profile_id,winner_member_code,winner_display_name,executed_at,created_at,updated_at").order("created_at", { ascending: false }).limit(200),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "APPROVED").eq("role", "USER"),
  ]);
  return ((data as RaffleEvent[] | null) ?? []).map((item) => ({ ...item, participant_count: count ?? 0 }));
}

export async function getAdminNotices(): Promise<Notice[]> {
  if (demoMode) return [{ id: "notice-demo", title: "운영 안내", body: "공지 예시입니다.", is_pinned: true, is_public: true, starts_at: null, ends_at: null, created_at: new Date().toISOString() }];
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
        { id: "l1", action: "DRAW_EXECUTED", created_at: new Date().toISOString(), admin_name: "Dynamic 관리자" },
        { id: "l2", action: "MEMBER_APPROVED", created_at: new Date(Date.now() - 3600000).toISOString(), admin_name: "Dynamic 관리자" },
      ],
    };
  }
  const admin = createAdminClient();
  const [statsResult, pendingResult, activeDrawResult, resultsResult, logsResult] = await Promise.all([
    admin.rpc("get_admin_stats"),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
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
    pendingMembers: pendingResult.count ?? 0,
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
      },
    ];
  }
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("*").order("created_at", { ascending: false });
  return (data as Profile[] | null) ?? [];
}

export async function getAdminDraws(): Promise<Draw[]> {
  if (demoMode) return [mockDraw];
  const admin = createAdminClient();
  const { data } = await admin
    .from("draws")
    .select("*, rewards(*)")
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
  const { data } = await admin
    .from("results")
    .select("id,created_at,revealed_at,voided_at,void_reason,public_display_name,public_member_code,draws(name),rewards(name,color),profiles(display_name,member_code)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getAdminLogs(limit = 100) {
  if (demoMode) {
    return [
      { id: "log-1", action: "DRAW_EXECUTED", target_table: "results", target_id: "r1", created_at: new Date().toISOString(), ip_address: "127.0.0.1", entry_hash: "a9f0…demo", profiles: { display_name: "Dynamic 관리자" } },
      { id: "log-2", action: "PROBABILITY_UPDATED", target_table: "draws", target_id: mockDraw.id, created_at: new Date(Date.now() - 7200000).toISOString(), ip_address: "127.0.0.1", entry_hash: "41cd…demo", profiles: { display_name: "Dynamic 관리자" } },
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
  if (action === "DRAW_TICKETS_GRANTED") return { title: "추첨권 지급", description: `${drawName} 추첨권 ${(details.quantityAdded ?? "")}장 지급` };
  if (action === "ADMIN_DRAW_TICKET_CONSUMED" || action === "USER_SELF_DRAW_EXECUTED") return { title: "추첨권 사용", description: `${drawName} 추첨권 1장 사용` };
  if (action === "VIRTUAL_CURRENCY_GRANTED") return { title: "화폐 지급", description: `${currencyName} ${(details.amountAdded ?? "")} 지급` };
  if (action === "USER_EXCHANGED_CURRENCY_TO_TICKETS") return { title: "화폐 교환", description: `${currencyName} 사용 후 ${drawName} 추첨권 ${(details.ticketsAdded ?? "")}장 교환` };
  if (action === "MEMBER_BULK_APPROVED" || action === "MEMBER_APPROVED") return { title: "회원 승인", description: "관리자가 회원가입을 승인했습니다." };
  return { title: action, description: "운영 로그" };
}

type ActivityTicketRow = { profile_id: string; draw_id: string; quantity: number; updated_at: string | null; profiles?: { display_name?: string | null; email?: string | null; username?: string | null; member_code?: string | null } | Array<{ display_name?: string | null; email?: string | null; username?: string | null; member_code?: string | null }> | null; draws?: { name?: string | null } | Array<{ name?: string | null }> | null };
type ActivityCurrencyRow = { profile_id: string; currency_id: string; balance: number; updated_at: string | null; profiles?: { display_name?: string | null; email?: string | null; username?: string | null; member_code?: string | null } | Array<{ display_name?: string | null; email?: string | null; username?: string | null; member_code?: string | null }> | null; currency?: { name?: string | null; symbol?: string | null } | Array<{ name?: string | null; symbol?: string | null }> | null };
type ActivityInventoryRow = { reward_id: string; quantity: number; rewards?: { name?: string | null; color?: string | null; is_exchange_material?: boolean | null } | Array<{ name?: string | null; color?: string | null; is_exchange_material?: boolean | null }> | null };
type ActivityLogRow = { id: string; action: string; target_id: string | null; details: Record<string, unknown> | null; created_at: string };

export async function getAdminUserActivityData(profileId?: string): Promise<AdminUserActivityData> {
  if (demoMode) return { profile: null, tickets: [], currencies: [], inventory: mockInventory, activities: [] };
  if (!profileId) return { profile: null, tickets: [], currencies: [], inventory: [], activities: [] };
  const admin = createAdminClient();
  const [profileResult, ticketResult, currencyResult, inventoryResult, logResult] = await Promise.all([
    admin.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    admin.from("draw_tickets").select("profile_id,draw_id,quantity,updated_at,profiles(display_name,email,username,member_code),draws(name)").eq("profile_id", profileId).order("updated_at", { ascending: false }),
    admin.from("currency_balances").select("profile_id,currency_id,balance,updated_at,profiles(display_name,email,username,member_code),currency:virtual_currencies(name,symbol)").eq("profile_id", profileId).order("updated_at", { ascending: false }),
    admin.from("participant_items").select("reward_id,quantity,rewards(name,color,is_exchange_material)").eq("profile_id", profileId).gt("quantity", 0),
    admin.from("admin_logs").select("id,action,target_id,details,created_at").order("created_at", { ascending: false }).limit(300),
  ]);

  const profile = (profileResult.data as Profile | null) ?? null;
  const tickets = ((ticketResult.data ?? []) as ActivityTicketRow[]).map((row) => { const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; const d = Array.isArray(row.draws) ? row.draws[0] : row.draws; return { profile_id: row.profile_id, draw_id: row.draw_id, quantity: row.quantity, profile_name: p?.display_name ?? "회원", profile_email: p?.email ?? "", profile_username: p?.username ?? null, member_code: p?.member_code ?? null, draw_name: d?.name ?? "뽑기", updated_at: row.updated_at ?? null }; }) as AdminTicketBalance[];
  const currencies = ((currencyResult.data ?? []) as ActivityCurrencyRow[]).map((row) => { const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; const c = Array.isArray(row.currency) ? row.currency[0] : row.currency; return { profile_id: row.profile_id, currency_id: row.currency_id, balance: row.balance, profile_name: p?.display_name ?? "회원", profile_email: p?.email ?? "", profile_username: p?.username ?? null, member_code: p?.member_code ?? null, currency_name: c?.name ?? "화폐", currency_symbol: c?.symbol ?? "", updated_at: row.updated_at ?? null }; }) as AdminCurrencyBalance[];
  const inventory = ((inventoryResult.data ?? []) as ActivityInventoryRow[]).map((row) => { const r = Array.isArray(row.rewards) ? row.rewards[0] : row.rewards; return { reward_id: row.reward_id, reward_name: r?.name ?? "상품", reward_color: r?.color ?? "#94a3b8", quantity: row.quantity, is_exchange_material: Boolean(r?.is_exchange_material) }; }) as InventoryItem[];
  const activities = ((logResult.data ?? []) as ActivityLogRow[]).filter((row) => { const details = (row.details ?? {}) as Record<string, unknown>; return row.target_id === profileId || details.profileId === profileId || details.participantId === profileId; }).slice(0,80).map((row) => { const details = (row.details ?? {}) as Record<string, unknown>; const label = activityLabel(row.action, details); return { id: row.id, created_at: row.created_at, action: row.action, title: label.title, description: label.description, amount: typeof details.quantityAdded === "number" ? details.quantityAdded : typeof details.amountAdded === "number" ? details.amountAdded : null }; }) as UserActivityEntry[];
  return { profile, tickets, currencies, inventory, activities };
}
