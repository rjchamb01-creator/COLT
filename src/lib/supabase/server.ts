// Server Supabase client — for Server Components, Server Actions, and Route Handlers.
// Next.js 16: cookies() is async, so this factory is async too.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types";
import { getSupabaseEnv } from "./config";

export async function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `setAll` is called from a Server Component, where writing cookies
          // is not allowed. This is safe to ignore when the session is being
          // refreshed by the proxy (middleware) instead.
        }
      },
    },
  });
}
