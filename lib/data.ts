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
  AdminTicketBalance,
  ExchangeRule,
  InventoryItem,
  Profile,
  PublicStats,
  PublicSettings,
  UserResultRow,
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
    siteName: "Dynamic Draw",
    heroTitle: "결과는 짜릿하게, 운영은 투명하게.",
    heroDescription: "확률과 결과를 실시간으로 공개하는 이벤트 추첨 시스템",
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

export async function getAdminTicketBalances(): Promise<AdminTicketBalance[]> {
  if (demoMode) {
    return [{
      profile_id: "approved-1",
      draw_id: mockDraw.id,
      quantity: 3,
      profile_name: "승인 회원",
      profile_email: "member@example.com",
      member_code: "DD-2026-000432",
      draw_name: mockDraw.name,
      updated_at: new Date().toISOString(),
    }];
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("draw_tickets")
    .select("profile_id,draw_id,quantity,updated_at,profiles(display_name,email,member_code),draws(name)")
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
      profile_email: profile?.email ?? "-",
      member_code: profile?.member_code ?? null,
      draw_name: draw?.name ?? "뽑기",
      updated_at: row.updated_at ?? null,
    };
  });
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
        email: "newuser@example.com",
        display_name: "가입 대기 회원",
        phone: "010-1234-5678",
        role: "USER",
        status: "PENDING",
        member_code: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "approved-1",
        email: "member@example.com",
        display_name: "승인 회원",
        phone: "010-9876-5432",
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
    .select("*, profiles!admin_logs_admin_id_fkey(display_name,email)")
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
