import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const FORMAT = "dynamicd-v1";

function getSecret() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ADMIN_SETUP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dynamicd-local-recovery-secret"
  ).trim();
}

function signPassword(password: string, salt: string) {
  return createHmac("sha256", getSecret()).update(`${salt}:${password}`).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeCustomPasswordHash(password: string) {
  const salt = randomBytes(18).toString("base64url");
  const digest = signPassword(String(password || ""), salt);
  return `${FORMAT}:${salt}:${digest}`;
}

export function verifyCustomPasswordHash(password: string, storedHash?: string | null) {
  const raw = String(storedHash || "").trim();
  if (!raw.startsWith(`${FORMAT}:`)) return false;

  const [, salt, digest] = raw.split(":");
  if (!salt || !digest) return false;

  return safeEqual(signPassword(String(password || ""), salt), digest);
}

export function isCustomPasswordHash(storedHash?: string | null) {
  return String(storedHash || "").startsWith(`${FORMAT}:`);
}
