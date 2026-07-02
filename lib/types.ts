export type ProfileStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | "DELETED";
export type UserRole = "USER" | "VIEWER" | "CS_MANAGER" | "MANAGER" | "SUPER_ADMIN";
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
  duplicate_risk_score?: number | null;
  duplicate_risk_flags?: string[] | null;
  login_state?: "ONLINE" | "OFFLINE" | "TRYING" | "FAILED" | null;
  last_login_attempt_at?: string | null;
  last_seen_at?: string | null;
  ip_address?: string | null;
  browser_fingerprint?: string | null;
}

export interface Reward {
  id: string;
  draw_id: string;
  product_catalog_id?: string | null;
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
  deleted_at?: string | null;
}


export interface ProductCatalogItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  color: string;
  default_stock: number | null;
  is_inventory_item: boolean;
  is_exchange_material: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
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
  deleted_at?: string | null;
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
  deleted_at?: string | null;
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
  deleted_at?: string | null;
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
  source_product_catalog_id?: string | null;
  target_product_catalog_id?: string | null;
}

export interface InventoryItem {
  reward_id: string;
  reward_name: string;
  reward_color: string;
  quantity: number;
  is_exchange_material: boolean;
  product_catalog_id?: string | null;
  canonical_reward_id?: string | null;
}

export interface PublicStats {
  totalDraws: number;
  todayDraws: number;
  totalMembers: number;
  rewardStats: Array<{
    rewardId: string;
    drawId?: string;
    drawName?: string;
    name: string;
    count: number;
    actualRate: number;
    configuredRate: number;
    color: string;
  }>;
  dailyStats: Array<{ date: string; count: number; drawId?: string }>;
  drawOptions?: Array<{ drawId: string; drawName: string; total: number; status?: string | null }>;
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
  required_member_tier_id?: string | null;
  required_member_tier_name?: string | null;
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

export interface UserActivityEntry {
  id: string;
  created_at: string;
  action: string;
  title: string;
  description: string;
  amount?: number | null;
}

export interface AdminUserActivityData {
  profile: Profile | null;
  tickets: AdminTicketBalance[];
  currencies: AdminCurrencyBalance[];
  inventory: InventoryItem[];
  activities: UserActivityEntry[];
}

export interface RandomBox {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  is_signup_reward: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  created_at: string;
  deleted_at?: string | null;
}

export interface RandomBoxReward {
  id: string;
  box_id: string;
  reward_type: "CURRENCY" | "TICKET" | "ITEM" | "RANDOM_BOX" | "EXP";
  amount: number;
  probability_units: number;
  label: string | null;
  currency_id: string | null;
  draw_id: string | null;
  reward_id: string | null;
  random_box_id: string | null;
  is_active: boolean;
  sort_order: number;
  currency_name?: string | null;
  draw_name?: string | null;
  reward_name?: string | null;
  random_box_name?: string | null;
}

export interface UserRandomBox {
  id: string;
  profile_id: string;
  box_id: string;
  quantity: number;
  source: string | null;
  updated_at: string;
  box?: RandomBox | RandomBox[] | null;
}

export interface AttendanceRule {
  id: string;
  name: string;
  rule_type: "DAILY" | "STREAK" | "MONTHLY";
  required_count: number;
  rewards: Array<Record<string, unknown>>;
  is_active: boolean;
  sort_order: number;
}

export interface AttendanceLog {
  id: string;
  profile_id: string;
  attendance_date: string;
  source: "SELF" | "ADMIN";
  streak_count: number;
  reward_snapshot: Array<Record<string, unknown>>;
  created_at: string;
}

export interface PromoCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  code_type: "COUPON" | "EVENT_CODE";
  visibility?: "public" | "hidden" | "admin_only" | "event_only" | null;
  target_mode: "ALL" | "PROFILE" | "ROLE";
  target_profile_id: string | null;
  target_role: UserRole | null;
  event_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  per_user_limit: number;
  used_count: number;
  rewards: Array<Record<string, unknown>>;
  is_active: boolean;
  created_at: string;
  deleted_at?: string | null;
  target_profile_name?: string | null;
  event_title?: string | null;
}

export interface NotificationItem {
  id: string;
  profile_id: string;
  title: string;
  body: string;
  type: string;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ReferralSummary {
  referralCode: string | null;
  referredBy: string | null;
  totalApproved: number;
}

export interface RewardCenterData {
  referral: ReferralSummary;
  boxes: Array<UserRandomBox & { box_name: string; box_description: string | null; box_image_url: string | null }>;
  attendanceToday: AttendanceLog | null;
  recentAttendance: AttendanceLog[];
  notifications: NotificationItem[];
  availablePromoCodes: PromoCode[];
}

export interface AdminRewardSystemData {
  boxes: RandomBox[];
  boxRewards: RandomBoxReward[];
  attendanceRules: AttendanceRule[];
  promoCodes: PromoCode[];
  members: Profile[];
  draws: Draw[];
  currencies: VirtualCurrency[];
  rewards: Reward[];
  settings: {
    signupBoxId: string | null;
    signupBoxAmount: number;
    referralReferrerBoxId: string | null;
    referralReferrerBoxAmount: number;
    referralReferredBoxId: string | null;
    referralReferredBoxAmount: number;
  };
}

export interface AdminRewardRecoveryLog {
  id: string;
  kind: "TICKET" | "CURRENCY";
  profile_id: string;
  draw_id: string | null;
  currency_id: string | null;
  amount_recovered: number;
  balance_before: number;
  balance_after: number;
  reason: string;
  memo: string | null;
  created_by: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  created_at: string;
  profile_name?: string | null;
  profile_email?: string | null;
  profile_username?: string | null;
  member_code?: string | null;
  draw_name?: string | null;
  currency_name?: string | null;
  currency_symbol?: string | null;
  admin_name?: string | null;
}
