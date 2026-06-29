import { redirect } from "next/navigation";
import { demoMode, supabaseConfigured } from "@/lib/env";
import { mockAdmin, mockProfile } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

const ADMIN_ROLES = new Set(["VIEWER", "MANAGER", "SUPER_ADMIN"]);

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!supabaseConfigured) return demoMode ? mockProfile : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
}


async function isLoginBlacklisted(profileId: string) {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("blacklist_entries")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("status", "ACTIVE")
      .in("scope", ["ALL", "LOGIN"]);
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function requireApprovedUser() {
  if (demoMode) return mockProfile;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/account");
  if (profile.status === "PENDING") redirect("/pending");
  if (profile.status !== "APPROVED") redirect("/login?error=account_unavailable");
  if (await isLoginBlacklisted(profile.id)) redirect("/login?error=account_restricted");
  return profile;
}

export async function requireAdmin(minimum: "VIEWER" | "MANAGER" | "SUPER_ADMIN" = "VIEWER") {
  if (demoMode) return mockAdmin;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/admin");
  if (profile.status !== "APPROVED" || !ADMIN_ROLES.has(profile.role)) redirect("/");

  const rank = { VIEWER: 1, MANAGER: 2, SUPER_ADMIN: 3, USER: 0 } as const;
  if (rank[profile.role] < rank[minimum]) redirect("/admin?error=forbidden");
  return profile;
}

export function isAdminRole(role: string) {
  return ADMIN_ROLES.has(role);
}
