import { enforceSameOrigin, ok, requestMeta } from "@/lib/api";
import { demoMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (demoMode) return ok({});
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const admin = createAdminClient();
    await admin.from("member_session_status").upsert({ profile_id: user.id, status: "OFFLINE", last_logout_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }, { onConflict: "profile_id" }).catch(() => undefined);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile && ["VIEWER", "MANAGER", "SUPER_ADMIN"].includes(profile.role)) {
      const meta = requestMeta(request);
      await admin.rpc("append_admin_log", {
        p_admin_id: user.id,
        p_action: "ADMIN_LOGOUT",
        p_target_table: "profiles",
        p_target_id: user.id,
        p_details: {},
        p_ip: meta.ip,
        p_user_agent: meta.userAgent,
      });
    }
  }
  await supabase.auth.signOut();
  return ok({});
}
