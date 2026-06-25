const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const adminSetupSecret = process.env.ADMIN_SETUP_SECRET ?? "";

function looksReal(value: string) {
  return Boolean(value) && !value.includes("YOUR_") && !value.includes("YOUR_PROJECT");
}

export const supabaseConfigured = looksReal(url) && looksReal(publishableKey);
export const supabaseAdminConfigured = supabaseConfigured && looksReal(secretKey);
export const adminSetupConfigured = looksReal(adminSetupSecret) && adminSetupSecret.length >= 32;
export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !supabaseConfigured;

export const serverEnv = { adminSetupSecret };

export const publicEnv = {
  supabaseUrl: url,
  supabasePublishableKey: publishableKey,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function requireServerSecrets() {
  if (!supabaseAdminConfigured) {
    throw new Error("SUPABASE_SECRET_KEY 환경변수가 설정되지 않았습니다.");
  }
  return { url, secretKey };
}
