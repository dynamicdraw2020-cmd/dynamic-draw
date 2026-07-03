import { redirect } from "next/navigation";
import { demoMode, supabaseConfigured } from "@/lib/env";
import { mockAdmin, mockProfile } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mustChangePassword } from "@/lib/password-reset";
import type { Profile } from "@/lib/types";
import {
  type AdminCapability,
  type AdminRole,
  hasAnyAdminRole,
  hasCapability,
  hasMinimumRole,
  isAdminRole as isKnownAdminRole,
} from "@/lib/admin-capabilities";
import { runtimeLog } from "@/lib/ops/logger";
import { RUNTIME_LIMITS, withTimeout } from "@/lib/ops/runtime";

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!supabaseConfigured) return demoMode ? mockProfile : null;

  try {
    const supabase = await createClient();
    const userResult = await withTimeout(supabase.auth.getUser(), RUNTIME_LIMITS.authTimeoutMs, "get current auth user");
    const user = userResult.data.user;
    if (!user) return null;

    const profileResult = await withTimeout(supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(), RUNTIME_LIMITS.readQueryTimeoutMs, "get current profile");
    if (profileResult.error) return null;
    return (profileResult.data as Profile | null) ?? null;
  } catch (error) {
    // Supabase AuthRetryableFetchError/522/524가 나도 페이지 전체를 죽이지 않습니다.
    runtimeLog({ level: "WARN", event: "AUTH_PROFILE_FALLBACK_NULL", error });
    return null;
  }
}

async function getOperationModeForAuth() {
  try {
    const admin = createAdminClient();
    const { data } = await withTimeout(
      admin
        .from("site_settings")
        .select("key,value")
        .in("key", ["operation_mode", "operation_message", "operation_ends_at"]),
      RUNTIME_LIMITS.readQueryTimeoutMs,
      "operation mode auth",
    );

    const map = new Map((data ?? []).map((row: { key: string; value: unknown }) => [row.key, String(row.value ?? "").replace(/^"|"$/g, "")]));

    return {
      mode: map.get("operation_mode") || "ACTIVE",
      message: map.get("operation_message") || "",
      endsAt: map.get("operation_ends_at") || "",
    };
  } catch {
    return { mode: "ACTIVE", message: "", endsAt: "" };
  }
}

async function isLoginBlacklisted(profileId: string) {
  try {
    const admin = createAdminClient();
    const { count } = await withTimeout(
      admin
        .from("blacklist_entries")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("status", "ACTIVE")
        .in("scope", ["ALL", "LOGIN"]),
      RUNTIME_LIMITS.readQueryTimeoutMs,
      "login blacklist check",
    );

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
  if (mustChangePassword(profile)) redirect("/change-password");

  const operation = await getOperationModeForAuth();
  if (String(profile.role) === "USER" && operation.mode !== "ACTIVE" && operation.mode !== "NORMAL") {
    redirect("/system-status");
  }

  if (await isLoginBlacklisted(profile.id)) redirect("/login?error=account_restricted");
  return profile;
}

export async function requireAdmin(minimum: AdminRole = "VIEWER") {
  if (demoMode) return mockAdmin;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/admin");
  if (profile.status !== "APPROVED" || !hasAnyAdminRole(profile.role)) redirect("/");
  if (mustChangePassword(profile)) redirect("/change-password");

  const operation = await getOperationModeForAuth();
  if ((operation.mode === "INACTIVE" || operation.mode === "MAINTENANCE") && String(profile.role) !== "SUPER_ADMIN") {
    redirect("/system-status");
  }

  if (!hasMinimumRole(profile.role, minimum)) redirect("/admin?error=forbidden");
  return profile;
}

export async function requireAdminAny(allowedRoles: readonly AdminRole[]) {
  const profile = await requireAdmin("VIEWER");
  if (!allowedRoles.includes(String(profile.role) as AdminRole)) redirect("/admin?error=forbidden");
  return profile;
}

export async function requireAdminCapability(capability: AdminCapability) {
  const profile = await requireAdmin("VIEWER");
  if (!hasCapability(profile.role, capability)) redirect("/admin?error=forbidden");
  return profile;
}

export function isAdminRole(role: string) {
  return isKnownAdminRole(role);
}
