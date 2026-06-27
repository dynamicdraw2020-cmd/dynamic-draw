export const AUTH_EMAIL_DOMAIN = "dynamicdraw.local";

export function normalizeLoginId(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function validateLoginId(value: unknown) {
  const loginId = normalizeLoginId(value);
  if (loginId.length < 3 || loginId.length > 32) {
    return { ok: false as const, message: "아이디는 영문 소문자, 숫자, _ 조합으로 3~32자여야 합니다." };
  }
  if (!/^[a-z0-9_]+$/.test(loginId)) {
    return { ok: false as const, message: "아이디는 영문 소문자, 숫자, _만 사용할 수 있습니다." };
  }
  return { ok: true as const, loginId };
}

export function usernameToAuthEmail(username: string) {
  return `${normalizeLoginId(username)}@${AUTH_EMAIL_DOMAIN}`;
}

export const loginIdToAuthEmail = usernameToAuthEmail;

export function credentialToAuthEmail(credential: string) {
  const value = String(credential ?? "").trim().toLowerCase();
  return value.includes("@") ? value : usernameToAuthEmail(value);
}

export function displayLoginId(profile: { username?: string | null; email?: string | null; member_code?: string | null }) {
  if (profile.username) return profile.username;
  const email = profile.email ?? "";
  if (email.endsWith(`@${AUTH_EMAIL_DOMAIN}`)) return email.split("@")[0] ?? "-";
  return profile.member_code ?? email ?? "-";
}

export const publicLoginId = displayLoginId;
