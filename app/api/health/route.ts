import { ok } from "@/lib/api";
import { demoMode, supabaseConfigured } from "@/lib/env";

export async function GET() {
  return ok({ status: "healthy", mode: demoMode ? "preview" : "production", supabaseConfigured, time: new Date().toISOString() });
}
