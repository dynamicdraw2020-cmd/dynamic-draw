import { ok } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin.from("site_settings").select("key,value").in("key", ["operation_mode", "operation_message", "operation_ends_at", "operation_force_logout_at"]);
  const map = new Map((data ?? []).map((row: { key: string; value: unknown }) => [row.key, String(row.value ?? "").replace(/^"|"$/g, "")]));
  const mode = map.get("operation_mode") || "ACTIVE";
  let role = "GUEST";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      role = profile?.role ?? "USER";
    }
  } catch {}
  const mustLogout = (mode === "UPDATING" && role === "USER") || (mode === "INACTIVE" && role !== "SUPER_ADMIN" && role !== "GUEST");
  return ok({ mode, role, mustLogout, message: map.get("operation_message") || "", endsAt: map.get("operation_ends_at") || "", forceLogoutAt: map.get("operation_force_logout_at") || "" });
}
