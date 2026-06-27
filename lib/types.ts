export type ProfileStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type UserRole = "USER" | "VIEWER" | "MANAGER" | "SUPER_ADMIN";
export type DrawStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";

export interface Profile {
  id: string;
  email: string;
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

export interface AdminTicketBalance {
  profile_id: string;
  draw_id: string;
  quantity: number;
  profile_name: string;
  profile_email: string;
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

export interface PublicSettings {
  siteName: string;
  heroTitle: string;
  heroDescription: string;
  publicStats: boolean;
}
