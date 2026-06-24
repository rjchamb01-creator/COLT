// Service-role Supabase client — SERVER-ONLY. The service key bypasses Row Level
// Security, so this must never be imported into a client component or any path a
// user can drive directly. Its only caller is the Stripe webhook, which writes
// subscription/invoice rows (there are deliberately no client-facing RLS write
// policies on those tables — the webhook is the one privileged write path).
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { getSupabaseServiceEnv } from "./config";

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createServiceClient() {
  const { url, serviceKey } = getSupabaseServiceEnv();
  if (!client) {
    client = createSupabaseClient<Database>(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
