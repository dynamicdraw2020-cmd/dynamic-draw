export type ProfileStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type UserRole = "USER" | "VIEWER" | "MANAGER" | "SUPER_ADMIN";
export type DrawStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";

export interface Profile {
  id: string;
  email: string;
  username?: string | null;
  display_name: string;
  phone: string | null;
  role: UserRole;
  status: ProfileStatus;
  member_code: string | null;
  created_at: string;
  approved_at?: string | null;
}

export interface Reward {
  id: string;
  draw_id: string;
  name: string;
  description: string | null;
  probability_units: number;
  color: string;
  image_url: string | null;
  stock?: number | null;
  is_inventory_item: boolean;
  is_exchange_material: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface Draw {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: DrawStatus;
  animation_ms: number;
  is_public: boolean;
  rewards?: Reward[];
  created_at?: string;
}

export interface DrawTicket {
  profile_id: string;
  draw_id: string;
  quantity: number;
  updated_at?: string;
  draws?: Draw | Draw[] | null;
}

export interface UserDrawTicket {
  draw: Draw;
  quantity: number;
}

export interface VirtualCurrency {
  id: string;
  name: string;
  code: string;
  symbol: string;
  is_active: boolean;
  sort_order: number;
}

export interface UserCurrencyBalance {
  currency: VirtualCurrency;
  balance: number;
}

export interface AdminCurrencyBalance {
  profile_id: string;
  currency_id: string;
  balance: number;
  profile_name: string;
  profile_email: string;
  profile_username?: string | null;
  member_code: string | null;
  currency_name: string;
  currency_symbol: string;
  updated_at: string | null;
}

export interface TicketExchangeRate {
  id: string;
  draw_id: string;
  currency_id: string;
  currency_cost: number;
  ticket_quantity: number;
  is_active: boolean;
  sort_order: number;
  draw?: Draw | Draw[] | null;
  currency?: VirtualCurrency | VirtualCurrency[] | null;
}

export interface UserTicketExchangeRate {
  id: string;
  draw: Draw;
  currency: VirtualCurrency;
  currencyCost: number;
  ticketQuantity: number;
}

export interface AdminTicketBalance {
  profile_id: string;
  draw_id: string;
  quantity: number;
  profile_name: string;
  profile_email: string;
  profile_username?: string | null;
  member_code: string | null;
  draw_name: string;
  updated_at: string | null;
}

export interface DrawResult {
  id: string;
  draw_id: string;
  reward_id: string;
  participant_id: string | null;
  public_member_code: string | null;
  public_display_name: string | null;
  reward_name: string;
  reward_color: string;
  draw_name: string;
  created_at: string;
  revealed_at: string | null;
  voided_at?: string | null;
}

export interface ExchangeRule {
  id: string;
  name: string;
  source_reward_id: string;
  source_reward_name: string;
  source_quantity: number;
  target_reward_id: string;
  target_reward_name: string;
  target_quantity: number;
  is_active: boolean;
}

export interface InventoryItem {
  reward_id: string;
  reward_name: string;
  reward_color: string;
  quantity: number;
  is_exchange_material: boolean;
}

export interface PublicStats {
  totalDraws: number;
  todayDraws: number;
  totalMembers: number;
  rewardStats: Array<{
    rewardId: string;
    drawName?: string;
    name: string;
    count: number;
    actualRate: number;
    configuredRate: number;
    color: string;
  }>;
  dailyStats: Array<{ date: string; count: number }>;
}

export interface LiveEvent {
  id: string;
  draw_id: string;
  result_id: string | null;
  event_type: "DRAW_START" | "DRAW_ANIMATING" | "DRAW_RESULT" | "STATS_UPDATE";
  payload: Record<string, unknown>;
  created_at: string;
}

export interface UserResultRow {
  id: string;
  created_at: string;
  revealed_at: string | null;
  voided_at: string | null;
  draws: { name: string } | Array<{ name: string }> | null;
  rewards: { name: string; color: string } | Array<{ name: string; color: string }> | null;
}


export interface RaffleEvent {
  id: string;
  title: string;
  description: string | null;
  prize_name: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
  is_public: boolean;
  starts_at: string | null;
  ends_at: string | null;
  winner_profile_id: string | null;
  winner_member_code: string | null;
  winner_display_name: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface AdminRaffleEvent extends RaffleEvent {
  participant_count?: number;
}

export interface PublicSettings {
  siteName: string;
  heroTitle: string;
  heroDescription: string;
  publicStats: boolean;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  is_public: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface EventPost {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  body: string | null;
  status: "DRAFT" | "ACTIVE" | "ENDED" | "ARCHIVED";
  is_public: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at?: string | null;
}
