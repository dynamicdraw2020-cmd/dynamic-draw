export const ADMIN_ROLES = ["VIEWER", "CS_MANAGER", "MANAGER", "SUPER_ADMIN"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export type AppRole = "USER" | AdminRole;

export type AdminCapability =
  | "ADMIN_HOME"
  | "MEMBER_STATUS"
  | "SUPPORT_REPLY"
  | "GRANT_REWARD"
  | "FULL_MANAGER";

export const ROLE_LABELS: Record<string, string> = {
  USER: "일반 회원",
  VIEWER: "조회 관리자",
  CS_MANAGER: "CS매니저",
  MANAGER: "일반 관리자",
  SUPER_ADMIN: "최고 관리자",
};

export const ROLE_RANK: Record<string, number> = {
  USER: 0,
  VIEWER: 1,
  CS_MANAGER: 1.5,
  MANAGER: 2,
  SUPER_ADMIN: 3,
};

export const CAPABILITY_ROLES: Record<AdminCapability, readonly AdminRole[]> = {
  ADMIN_HOME: ["VIEWER", "CS_MANAGER", "MANAGER", "SUPER_ADMIN"],
  MEMBER_STATUS: ["CS_MANAGER", "MANAGER", "SUPER_ADMIN"],
  SUPPORT_REPLY: ["CS_MANAGER", "MANAGER", "SUPER_ADMIN"],
  GRANT_REWARD: ["CS_MANAGER", "MANAGER", "SUPER_ADMIN"],
  FULL_MANAGER: ["MANAGER", "SUPER_ADMIN"],
};

export function normalizeRole(role: unknown): string {
  return String(role ?? "USER").toUpperCase();
}

export function isAdminRole(role: unknown): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(normalizeRole(role));
}

export function hasAnyAdminRole(role: unknown): boolean {
  return isAdminRole(role);
}

export function hasMinimumRole(role: unknown, minimum: AdminRole): boolean {
  const current = ROLE_RANK[normalizeRole(role)] ?? 0;
  const required = ROLE_RANK[minimum] ?? 999;
  return current >= required;
}

export function hasCapability(role: unknown, capability: AdminCapability): boolean {
  const normalized = normalizeRole(role);
  return CAPABILITY_ROLES[capability].includes(normalized as AdminRole);
}

export function canManageMemberStatus(adminRole: unknown, targetRole: unknown): boolean {
  const admin = normalizeRole(adminRole);
  const target = normalizeRole(targetRole);
  if (admin === "SUPER_ADMIN") return true;
  if (!hasCapability(admin, "MEMBER_STATUS")) return false;
  return target === "USER";
}
