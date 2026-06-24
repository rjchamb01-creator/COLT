// Auth code-exchange callback. Email links (password reset, and any future
// confirm/magic-link flow) send the user here with a `?code=`. We exchange it for
// a session cookie, then forward to `next` (e.g. /reset-password). Public route —
// /auth is in the proxy's PUBLIC_PATHS so a logged-out user can complete it.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Behind Vercel's proxy the public host is on x-forwarded-host; prefer it so
  // the redirect lands on the real domain, not an internal one.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base = !isLocal && forwardedHost ? `https://${forwardedHost}` : origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  // No code, or the exchange failed (expired/used link).
  return NextResponse.redirect(`${base}/login?error=reset_link`);
}
