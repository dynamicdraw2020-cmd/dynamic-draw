import { envDiagnostics, publicEnv, supabaseAdminConfigured, supabaseConfigured } from "@/lib/env";

export function getRuntimeEnvReport() {
  const missing: string[] = [];
  if (!envDiagnostics.supabaseUrlPresent || !envDiagnostics.supabaseUrlValid) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!envDiagnostics.publishableKeyPresent) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  else if (!envDiagnostics.publishableKeySafe) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY에 Secret/Service Role Key가 들어감");
  if (!envDiagnostics.secretKeyPresent) missing.push("SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY");
  else if (!envDiagnostics.secretKeySafe) missing.push("SUPABASE_SECRET_KEY에 Publishable/Anon Key가 들어감");
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
    throw new Error(`DynamicD required env wrong: ${report.missing.join(", ")}`);
  }
  return report;
}
