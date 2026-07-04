import { ok, requestMeta } from "@/lib/api";
import { demoMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { EMERGENCY_SESSION_COOKIE, getEmergencyProfileIdFromCookies } from "@/lib/emergency-session";

export async function POST(request: Request) {
  if (demoMode) return ok({});
  const supabase = await createClient();
  const emergencyProfileId = await getEmergencyProfileIdFromCookies();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? emergencyProfileId;

  if (userId) {
    const admin = createAdminClient();
    await admin
      .from("member_session_status")
      .upsert({ profile_id: userId, status: "OFFLINE", is_online: false, last_logout_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }, { onConflict: "profile_id" })
      .then(undefined, () => undefined);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profile && ["VIEWER", "MANAGER", "SUPER_ADMIN"].includes(String(profile.role))) {
      const meta = requestMeta(request);
      await admin
        .rpc("append_admin_log", {
          p_admin_id: userId,
          p_action: "ADMIN_LOGOUT",
          p_target_table: "profiles",
          p_target_id: userId,
          p_details: {},
          p_ip: meta.ip,
          p_user_agent: meta.userAgent,
        })
        .then(undefined, () => undefined);
    }
  }

  await supabase.auth.signOut().catch(() => undefined);
  const response = ok({ signedOut: true });
  response.cookies.delete(EMERGENCY_SESSION_COOKIE);
  return response;
}
