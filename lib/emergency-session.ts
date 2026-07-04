import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const EMERGENCY_SESSION_COOKIE = "dynamicd_recovery_session";
const MAX_AGE_SECONDS = 60 * 60 * 24;

function getSigningSecret() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ADMIN_SETUP_SECRET ||
    ""
  ).trim();
}

function signPayload(payload: string) {
  const secret = getSigningSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createEmergencySessionValue(profileId: string) {
  const cleanProfileId = String(profileId || "").trim();
  if (!cleanProfileId) return "";
  const issuedAt = Date.now();
  const payload = `${cleanProfileId}.${issuedAt}`;
  const signature = signPayload(payload);
  if (!signature) return "";
  return `${payload}.${signature}`;
}

export function readEmergencySessionValue(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const [profileId, issuedAtRaw, signature] = raw.split(".");
  if (!profileId || !issuedAtRaw || !signature) return null;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > MAX_AGE_SECONDS * 1000) return null;

  const expected = signPayload(`${profileId}.${issuedAtRaw}`);
  if (!expected || !safeEqual(signature, expected)) return null;

  return profileId;
}

export async function getEmergencyProfileIdFromCookies() {
  try {
    const cookieStore = await cookies();
    return readEmergencySessionValue(cookieStore.get(EMERGENCY_SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export const emergencySessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

export const clearEmergencySessionCookieOptions = {
  ...emergencySessionCookieOptions,
  maxAge: 0,
};
