import { envDiagnostics, publicEnv, supabaseAdminConfigured, supabaseConfigured } from "@/lib/env";

export function getRuntimeEnvReport() {
  const missing: string[] = [];
  if (!envDiagnostics.supabaseUrlPresent || !envDiagnostics.supabaseUrlValid) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!envDiagnostics.publishableKeyPresent) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!envDiagnostics.secretKeyPresent) missing.push("SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY");
  if (!envDiagnostics.adminSetupSecretPresent || !envDiagnostics.adminSetupSecretLongEnough) missing.push("ADMIN_SETUP_SECRET(32자 이상 권장)");

  return {
    ok: supabaseConfigured && supabaseAdminConfigured,
    publicOk: supabaseConfigured,
    adminOk: supabaseAdminConfigured,
    missing,
    siteUrl: publicEnv.siteUrl,
    diagnostics: envDiagnostics,
    strict: process.env.DYNAMICD_STRICT_ENV === "true",
  };
}

export function assertRuntimeEnvForBuild() {
  const report = getRuntimeEnvReport();
  if (report.strict && !report.ok) {
    throw new Error(`DynamicD required env missing: ${report.missing.join(", ")}`);
  }
  return report;
}
