import { redirect } from "next/navigation";
import { demoMode, supabaseConfigured } from "@/lib/env";
import { mockAdmin, mockProfile } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/server";
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

export async function requireApprovedUser() {
  if (demoMode) return mockProfile;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/account");
  if (profile.status === "PENDING") redirect("/pending");
  if (profile.status !== "APPROVED") redirect("/login?error=account_unavailable");
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
