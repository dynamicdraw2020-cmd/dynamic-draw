import { createClient } from "@supabase/supabase-js";
import { requireServerSecrets } from "@/lib/env";

export function createAdminClient() {
  const { url, secretKey } = requireServerSecrets();
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
