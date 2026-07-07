import { createAdminClient } from "@/lib/supabase/admin";
import { RUNTIME_LIMITS, withTimeout } from "@/lib/ops/runtime";
import { runtimeLog } from "@/lib/ops/logger";
import { COUPON_VISIBILITY_LABELS, normalizeCouponVisibility, type CouponVisibility, type StepEventResourceOption } from "@/lib/step-event-config";

export type AdminCouponRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  code_type: string;
  visibility: CouponVisibility;
  target_mode: string;
  target_profile_id: string | null;
  target_role: string | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  per_user_limit: number;
  used_count: number;
  rewards: Array<Record<string, unknown>>;
  is_active: boolean;
  created_at: string;
  deleted_at?: string | null;
};

export type AdminCouponVisibilityData = {
  coupons: AdminCouponRow[];
  loadError?: string | null;
  resources: {
    currencies: StepEventResourceOption[];
    draws: StepEventResourceOption[];
    rewards: StepEventResourceOption[];
    boxes: StepEventResourceOption[];
  };
};

function rowToCoupon(row: Record<string, unknown>): AdminCouponRow {
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? "쿠폰"),
    description: typeof row.description === "string" ? row.description : null,
    code_type: String(row.code_type ?? "COUPON"),
    visibility: normalizeCouponVisibility(row.visibility),
    target_mode: String(row.target_mode ?? "ALL"),
    target_profile_id: typeof row.target_profile_id === "string" ? row.target_profile_id : null,
    target_role: typeof row.target_role === "string" ? row.target_role : null,
    starts_at: typeof row.starts_at === "string" ? row.starts_at : null,
    ends_at: typeof row.ends_at === "string" ? row.ends_at : null,
    max_uses: row.max_uses === null || row.max_uses === undefined ? null : Number(row.max_uses),
    per_user_limit: Math.max(1, Number(row.per_user_limit ?? 1) || 1),
    used_count: Math.max(0, Number(row.used_count ?? 0) || 0),
    rewards: Array.isArray(row.rewards) ? (row.rewards as Array<Record<string, unknown>>) : [],
    is_active: row.is_active !== false,
    created_at: String(row.created_at ?? new Date().toISOString()),
    deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
  };
}

function postgrestErrorMessage(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const error = (result as { error?: { message?: string; details?: string; code?: string } | null }).error;
  if (!error) return null;
  return [error.code, error.message, error.details].filter(Boolean).join(" · ") || "알 수 없는 DB 오류";
}

async function resourceRows() {
  const admin = createAdminClient();
  const [currencies, draws, rewards, boxes] = await Promise.allSettled([
    withTimeout(admin.from("virtual_currencies").select("id,name,code,symbol,is_active,deleted_at").eq("is_active", true).order("sort_order", { ascending: true }).limit(300), RUNTIME_LIMITS.readQueryTimeoutMs, "coupon resources currencies"),
    withTimeout(admin.from("draws").select("id,name,status,deleted_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(300), RUNTIME_LIMITS.readQueryTimeoutMs, "coupon resources draws"),
    withTimeout(admin.from("rewards").select("id,name,deleted_at,is_active").eq("is_active", true).is("deleted_at", null).order("sort_order", { ascending: true }).limit(500), RUNTIME_LIMITS.readQueryTimeoutMs, "coupon resources rewards"),
    withTimeout(admin.from("random_boxes").select("id,name,is_active,deleted_at").eq("is_active", true).is("deleted_at", null).order("sort_order", { ascending: true }).limit(300), RUNTIME_LIMITS.readQueryTimeoutMs, "coupon resources boxes"),
  ]);

  const rows = <T extends Record<string, unknown>>(result: PromiseSettledResult<{ data: T[] | null }>) => (result.status === "fulfilled" ? result.value.data ?? [] : []);
  return {
    currencies: rows(currencies).map((row) => ({ id: String(row.id), name: String(row.name ?? row.code ?? "화폐"), code: typeof row.code === "string" ? row.code : null, symbol: typeof row.symbol === "string" ? row.symbol : null })),
    draws: rows(draws).map((row) => ({ id: String(row.id), name: String(row.name ?? "뽑기"), status: typeof row.status === "string" ? row.status : null })),
    rewards: rows(rewards).map((row) => ({ id: String(row.id), name: String(row.name ?? "상품") })),
    boxes: rows(boxes).map((row) => ({ id: String(row.id), name: String(row.name ?? "랜덤박스") })),
  };
}

export async function getAdminCouponVisibilityData(): Promise<AdminCouponVisibilityData> {
  const fallback: AdminCouponVisibilityData = { coupons: [], loadError: null, resources: { currencies: [], draws: [], rewards: [], boxes: [] } };
  const admin = createAdminClient();
  try {
    const [couponsResult, resourcesResult] = await Promise.allSettled([
      withTimeout(
        admin.from("promo_codes").select("id,code,name,description,code_type,visibility,target_mode,target_profile_id,target_role,starts_at,ends_at,max_uses,per_user_limit,used_count,rewards,is_active,created_at,deleted_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        RUNTIME_LIMITS.readQueryTimeoutMs,
        "coupon visibility rows",
      ),
      resourceRows(),
    ]);

    let loadError: string | null = null;
    let couponRows: Array<Record<string, unknown>> = [];

    if (couponsResult.status === "fulfilled") {
      loadError = postgrestErrorMessage(couponsResult.value);
      if (loadError) {
        runtimeLog({ level: "WARN", event: "COUPON_VISIBILITY_QUERY_ERROR", details: { message: loadError } });

        // 예전 DB/누적 SQL 꼬임으로 일부 컬럼 조회가 실패하면 전체 컬럼 조회로 한 번 더 살립니다.
        const retry = await withTimeout(
          admin.from("promo_codes").select("*").order("created_at", { ascending: false }).limit(500),
          RUNTIME_LIMITS.readQueryTimeoutMs,
          "coupon visibility fallback rows",
        );
        const retryError = postgrestErrorMessage(retry);
        if (retryError) {
          loadError = retryError;
        } else {
          couponRows = ((retry.data ?? []) as Array<Record<string, unknown>>).filter((row) => !row.deleted_at);
          loadError = null;
        }
      } else {
        couponRows = (couponsResult.value.data ?? []) as Array<Record<string, unknown>>;
      }
    } else {
      loadError = couponsResult.reason instanceof Error ? couponsResult.reason.message : "쿠폰 목록을 불러오지 못했습니다.";
      runtimeLog({ level: "WARN", event: "COUPON_VISIBILITY_QUERY_REJECTED", details: { message: loadError } });
    }

    const coupons = couponRows.map(rowToCoupon);
    const resources = resourcesResult.status === "fulfilled" ? resourcesResult.value : fallback.resources;
    return { coupons, loadError, resources };
  } catch (error) {
    runtimeLog({ level: "WARN", event: "COUPON_VISIBILITY_FALLBACK_EMPTY", error });
    return { ...fallback, loadError: error instanceof Error ? error.message : "쿠폰 데이터를 불러오지 못했습니다." };
  }
}

export function couponVisibilitySummary(value: CouponVisibility) {
  return COUPON_VISIBILITY_LABELS[value] ?? "공개";
}
