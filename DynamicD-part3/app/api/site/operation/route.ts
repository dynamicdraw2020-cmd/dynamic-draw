import { ok, withApiRoute } from "@/lib/api";
import { supabaseAdminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

type OperationPayload = {
  mode: string;
  role: string;
  mustLogout: boolean;
  message: string;
  endsAt: string;
  forceLogoutAt: string;
  degraded?: boolean;
};

const DEFAULT_OPERATION: OperationPayload = {
  mode: "ACTIVE",
  role: "GUEST",
  mustLogout: false,
  message: "",
  endsAt: "",
  forceLogoutAt: "",
};

function normalizeSettingValue(value: unknown) {
  return String(value ?? "").replace(/^"|"$/g, "");
}

async function getHandler() {
  if (!supabaseAdminConfigured) {
    return ok({ ...DEFAULT_OPERATION, degraded: true });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("key,value")
      .in("key", ["operation_mode", "operation_message", "operation_ends_at", "operation_force_logout_at"]);

    if (error) {
      return ok({ ...DEFAULT_OPERATION, degraded: true, message: "운영 설정을 임시 기본값으로 표시 중입니다." });
    }

    const rows = Array.isArray(data) ? (data as Array<{ key?: string; value?: unknown }>) : [];
    const map = new Map(rows.filter((row) => typeof row.key === "string").map((row) => [String(row.key), normalizeSettingValue(row.value)]));
    const mode = map.get("operation_mode") || "ACTIVE";
    let role = "GUEST";

    try {
      const supabase = await createClient();
      const { data: userResult } = await supabase.auth.getUser();
      const user = userResult.user;
      if (user) {
        const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
        role = String((profile as { role?: string | null } | null)?.role ?? "USER");
      }
    } catch {
      role = "GUEST";
    }

    const mustLogout = (mode === "UPDATING" && role === "USER") || (mode === "INACTIVE" && role !== "SUPER_ADMIN" && role !== "GUEST");
    return ok({
      mode,
      role,
      mustLogout,
      message: map.get("operation_message") || "",
      endsAt: map.get("operation_ends_at") || "",
      forceLogoutAt: map.get("operation_force_logout_at") || "",
    });
  } catch {
    return ok({ ...DEFAULT_OPERATION, degraded: true, message: "운영 설정 API가 임시 기본값으로 복구되었습니다." });
  }
}

export const GET = withApiRoute(getHandler, {
  routeName: "/api/site/operation",
  timeoutMs: 4500,
  rateLimit: { kind: "public", limit: 120, windowSeconds: 60 },
});
