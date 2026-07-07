import { demoMode, supabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type DonationTier = {
  id: string;
  title: string;
  badge: string;
  minAmount: number;
  maxAmount: number | null;
  benefits: string[];
  note: string;
  sortOrder: number;
};

export type DonationSettings = {
  enabled: boolean;
  showHomeBanner: boolean;
  title: string;
  subtitle: string;
  heroMessage: string;
  ctaLabel: string;
  ctaUrl: string;
  accountInfo: string;
  guideTitle: string;
  guideBody: string;
  disclaimer: string;
  tiers: DonationTier[];
  updatedAt?: string | null;
};

export const DEFAULT_DONATION_TIERS: DonationTier[] = [
  {
    id: "supporter-basic",
    title: "응원 후원",
    badge: "BASIC",
    minAmount: 1000,
    maxAmount: 9999,
    benefits: ["후원자 감사 명단 등록", "운영 공지 내 감사 문구 표시"],
    note: "작은 응원도 운영 유지에 큰 도움이 됩니다.",
    sortOrder: 10,
  },
  {
    id: "supporter-plus",
    title: "서포터 후원",
    badge: "PLUS",
    minAmount: 10000,
    maxAmount: 29999,
    benefits: ["후원자 감사 명단 등록", "보상센터 안내 배지 지급 가능", "운영자가 지정한 이벤트 보상 우선 안내"],
    note: "실제 지급 여부와 지급 시점은 운영자가 최종 확인합니다.",
    sortOrder: 20,
  },
  {
    id: "supporter-vip",
    title: "VIP 후원",
    badge: "VIP",
    minAmount: 30000,
    maxAmount: null,
    benefits: ["후원자 감사 명단 상단 표시", "전용 감사 문구", "운영자가 설정한 추가 보상 협의"],
    note: "후원 특전은 이벤트 공정성과 별개로 운영됩니다.",
    sortOrder: 30,
  },
];

export const DEFAULT_DONATION_SETTINGS: DonationSettings = {
  enabled: true,
  showHomeBanner: true,
  title: "Dynamic D 후원 안내",
  subtitle: "후원은 서버 운영, 이벤트 관리, 보상 운영 안정화에 사용됩니다.",
  heroMessage: "후원 전 운영자가 안내한 계좌·링크·확인 절차를 꼭 확인해 주세요.",
  ctaLabel: "후원 문의하기",
  ctaUrl: "/support",
  accountInfo: "관리자 설정에서 후원 계좌, 송금 링크, 오픈채팅 링크 또는 안내 문구를 입력해 주세요.",
  guideTitle: "후원 이용 방법",
  guideBody: "1) 아래 금액별 혜택을 확인합니다.\n2) 후원 문의 버튼을 눌러 운영자에게 후원 의사를 전달합니다.\n3) 운영자가 입금/링크/인증 절차를 확인한 뒤 혜택을 처리합니다.",
  disclaimer: "후원은 자율 응원이며, 추첨 당첨 확률이나 일반 이벤트 참여 자격을 직접적으로 변경하지 않습니다. 혜택은 운영자가 공정성 기준에 맞춰 별도로 지급합니다.",
  tiers: DEFAULT_DONATION_TIERS,
  updatedAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max = 1200) {
  const next = String(value ?? "").trim();
  return (next || fallback).slice(0, max);
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function amount(value: unknown, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.round(next));
}

function normalizeTier(value: unknown, index: number): DonationTier {
  const source = isRecord(value) ? value : {};
  const minAmount = amount(source.minAmount ?? source.min_amount, index === 0 ? 1000 : (index + 1) * 10000);
  const rawMax = source.maxAmount ?? source.max_amount;
  const maxAmount = rawMax === null || rawMax === "" || typeof rawMax === "undefined" ? null : Math.max(minAmount, amount(rawMax, minAmount));
  const rawBenefits = source.benefits;
  const benefits = (Array.isArray(rawBenefits) ? rawBenefits : String(rawBenefits ?? "").split("\n"))
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);

  return {
    id: text(source.id, `tier-${index + 1}`, 80),
    title: text(source.title, `${minAmount.toLocaleString()}원 이상`, 80),
    badge: text(source.badge, index === 0 ? "BASIC" : "SUPPORT", 24),
    minAmount,
    maxAmount,
    benefits: benefits.length ? benefits : ["관리자 설정에서 혜택을 입력해 주세요."],
    note: text(source.note, "", 300),
    sortOrder: amount(source.sortOrder ?? source.sort_order, (index + 1) * 10),
  };
}

export function normalizeDonationSettings(value: unknown): DonationSettings {
  const source = isRecord(value) ? value : {};
  const fallback = DEFAULT_DONATION_SETTINGS;
  const rawTiers = Array.isArray(source.tiers) ? source.tiers : fallback.tiers;
  const tiers = rawTiers
    .map((tier, index) => normalizeTier(tier, index))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.minAmount - b.minAmount)
    .slice(0, 20);

  return {
    enabled: bool(source.enabled, fallback.enabled),
    showHomeBanner: bool(source.showHomeBanner ?? source.show_home_banner, fallback.showHomeBanner),
    title: text(source.title, fallback.title, 120),
    subtitle: text(source.subtitle, fallback.subtitle, 400),
    heroMessage: text(source.heroMessage ?? source.hero_message, fallback.heroMessage, 600),
    ctaLabel: text(source.ctaLabel ?? source.cta_label, fallback.ctaLabel, 50),
    ctaUrl: text(source.ctaUrl ?? source.cta_url, fallback.ctaUrl, 500),
    accountInfo: text(source.accountInfo ?? source.account_info, fallback.accountInfo, 1200),
    guideTitle: text(source.guideTitle ?? source.guide_title, fallback.guideTitle, 100),
    guideBody: text(source.guideBody ?? source.guide_body, fallback.guideBody, 1600),
    disclaimer: text(source.disclaimer, fallback.disclaimer, 1200),
    tiers: tiers.length ? tiers : fallback.tiers,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

export function formatDonationAmount(value: number | null | undefined) {
  if (value == null) return "상한 없음";
  return `${Math.max(0, value).toLocaleString()}원`;
}

export function donationTierRange(tier: Pick<DonationTier, "minAmount" | "maxAmount">) {
  if (tier.maxAmount == null) return `${formatDonationAmount(tier.minAmount)} 이상`;
  if (tier.minAmount <= 0) return `${formatDonationAmount(tier.maxAmount)} 이하`;
  return `${formatDonationAmount(tier.minAmount)} ~ ${formatDonationAmount(tier.maxAmount)}`;
}

export async function getDonationSettings(): Promise<DonationSettings> {
  if (demoMode || !supabaseConfigured) return DEFAULT_DONATION_SETTINGS;
  try {
    const { data, error } = await createAdminClient()
      .from("site_settings")
      .select("value,updated_at")
      .eq("key", "donation_settings")
      .maybeSingle();
    if (error || !data) return DEFAULT_DONATION_SETTINGS;
    return normalizeDonationSettings({ ...(data.value as Record<string, unknown>), updatedAt: data.updated_at ?? null });
  } catch {
    return DEFAULT_DONATION_SETTINGS;
  }
}
