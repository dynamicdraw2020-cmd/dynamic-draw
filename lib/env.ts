function stripAssignment(raw: string | undefined, names: string[]) {
  let value = (raw ?? "").trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  for (const name of names) {
    const prefix = `${name}=`;
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length).trim();
      break;
    }
  }
  return value;
}

function normalizeProjectUrl(raw: string | undefined) {
  const value = stripAssignment(raw, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return value;
    return parsed.origin;
  } catch {
    return value.replace(/\/(?:rest|auth|storage|realtime)\/v\d+\/?$/i, "").replace(/\/+$/, "");
  }
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    if (typeof globalThis.atob === "function") return globalThis.atob(padded);
  } catch {}
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8");
  } catch {}
  return "";
}

function jwtRole(value: string) {
  const parts = value.split(".");
  if (parts.length < 2) return "";
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : "";
  } catch {
    return "";
  }
}

export function supabaseKeyKind(value: string) {
  const key = value.trim();
  if (!key) return "missing" as const;
  if (key.startsWith("sb_publishable_")) return "publishable" as const;
  if (key.startsWith("sb_secret_")) return "secret" as const;
  const role = jwtRole(key);
  if (role === "anon") return "legacy_anon" as const;
  if (role === "service_role") return "legacy_service_role" as const;
  return "unknown" as const;
}

function isBrowserSafeSupabaseKey(value: string) {
  const kind = supabaseKeyKind(value);
  return kind === "publishable" || kind === "legacy_anon" || kind === "unknown";
}

function isServerSecretSupabaseKey(value: string) {
  const kind = supabaseKeyKind(value);
  return kind === "secret" || kind === "legacy_service_role";
}

const url = normalizeProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
const publishableKey = stripAssignment(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"],
);
const secretKey = stripAssignment(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY, ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
const adminSetupSecret = stripAssignment(process.env.ADMIN_SETUP_SECRET, ["ADMIN_SETUP_SECRET"]);
const publishableKeyKind = supabaseKeyKind(publishableKey);
const secretKeyKind = supabaseKeyKind(secretKey);
const publishableKeySafe = isBrowserSafeSupabaseKey(publishableKey);
const secretKeySafe = isServerSecretSupabaseKey(secretKey);

function looksReal(value: string) {
  return Boolean(value) && value.length > 10 && !value.includes("YOUR_") && !value.includes("YOUR_PROJECT") && !value.includes("CHANGE_THIS");
}
function looksLikeHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
  } catch {
    return false;
  }
}

export const supabaseConfigured = looksReal(url) && looksLikeHttpUrl(url) && looksReal(publishableKey) && publishableKeySafe;
export const supabaseAdminConfigured = supabaseConfigured && looksReal(secretKey) && secretKeySafe;
export const adminSetupConfigured = looksReal(adminSetupSecret) && adminSetupSecret.length >= 32;
export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !supabaseConfigured;
export const serverEnv = { adminSetupSecret };
export const publicEnv = {
  supabaseUrl: url,
  supabasePublishableKey: publishableKey,
  siteUrl: stripAssignment(process.env.NEXT_PUBLIC_SITE_URL, ["NEXT_PUBLIC_SITE_URL"]) || "http://localhost:3000",
};
export const envDiagnostics = {
  supabaseUrlPresent: Boolean(url),
  supabaseUrlValid: looksLikeHttpUrl(url),
  publishableKeyPresent: looksReal(publishableKey),
  publishableKeyKind,
  publishableKeySafe,
  publishableKeyLooksSecret: publishableKeyKind === "secret" || publishableKeyKind === "legacy_service_role",
  secretKeyPresent: looksReal(secretKey),
  secretKeyKind,
  secretKeySafe,
  secretKeyLooksPublic: secretKeyKind === "publishable" || secretKeyKind === "legacy_anon",
  adminSetupSecretPresent: looksReal(adminSetupSecret),
  adminSetupSecretLongEnough: adminSetupSecret.length >= 32,
  strictProductionEnv: process.env.DYNAMICD_ALLOW_MISSING_ENV !== "true",
};

export function productionEnvProblems() {
  const problems: string[] = [];
  if (!looksReal(url) || !looksLikeHttpUrl(url)) problems.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!looksReal(publishableKey)) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  else if (!publishableKeySafe) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY에 Secret/Service Role Key가 들어가 있습니다");
  if (!looksReal(secretKey)) problems.push("SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY");
  else if (!secretKeySafe) problems.push("SUPABASE_SECRET_KEY에 Publishable/Anon Key가 들어가 있습니다");
  return problems;
}

export function validateProductionEnv() {
  const shouldStrictCheck = process.env.VERCEL === "1" && process.env.NODE_ENV === "production" && process.env.DYNAMICD_ALLOW_MISSING_ENV !== "true";
  if (!shouldStrictCheck) return;
  const problems = productionEnvProblems();
  if (problems.length) throw new Error(`DynamicD 운영 환경변수가 잘못되었습니다: ${problems.join(", ")}`);
}

export function requireServerSecrets() {
  if (!supabaseAdminConfigured) {
    const problems = productionEnvProblems();
    throw new Error(`SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 올바르게 설정되지 않았습니다.${problems.length ? ` (${problems.join(", ")})` : ""}`);
  }
  return { url, secretKey };
}
