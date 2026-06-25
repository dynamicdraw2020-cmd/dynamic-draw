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
    if (!['http:', 'https:'].includes(parsed.protocol)) return value;
    return parsed.origin;
  } catch {
    return value.replace(/\/(?:rest|auth|storage|realtime)\/v\d+\/?$/i, "").replace(/\/+$/, "");
  }
}

const url = normalizeProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
const publishableKey = stripAssignment(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"],
);
const secretKey = stripAssignment(
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
);
const adminSetupSecret = stripAssignment(process.env.ADMIN_SETUP_SECRET, ["ADMIN_SETUP_SECRET"]);

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

export const supabaseConfigured = looksReal(url) && looksLikeHttpUrl(url) && looksReal(publishableKey);
export const supabaseAdminConfigured = supabaseConfigured && looksReal(secretKey);
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
  secretKeyPresent: looksReal(secretKey),
  adminSetupSecretPresent: looksReal(adminSetupSecret),
  adminSetupSecretLongEnough: adminSetupSecret.length >= 32,
};

export function requireServerSecrets() {
  if (!supabaseAdminConfigured) {
    throw new Error("SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 올바르게 설정되지 않았습니다.");
  }
  return { url, secretKey };
}
