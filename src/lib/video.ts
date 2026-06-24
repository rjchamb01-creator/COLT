// Resolve a stored drill video_url into a privacy-respecting inline embed.
//
// Youth product → privacy-first: YouTube resolves to the youtube-nocookie.com
// domain (no tracking cookie until play), Vimeo to its standard player. Anything
// we don't recognise returns null, so the UI falls back to a plain external link
// rather than embedding an arbitrary origin. Pure + server-safe (uses the WHATWG
// URL parser only) so it's trivial to reason about and reuse.

export type VideoEmbed = { provider: "youtube" | "vimeo"; src: string };

export function toVideoEmbed(rawUrl: string | null | undefined): VideoEmbed | null {
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // ---- YouTube → nocookie embed ----
  let ytId: string | null = null;
  if (host === "youtu.be") {
    ytId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    if (url.pathname === "/watch") {
      ytId = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) {
      ytId = url.pathname.split("/").filter(Boolean)[1] ?? null;
    }
  }
  if (ytId && /^[A-Za-z0-9_-]{6,15}$/.test(ytId)) {
    return {
      provider: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0`,
    };
  }

  // ---- Vimeo → player embed ----
  let vimeoId: string | null = null;
  if (host === "vimeo.com") {
    vimeoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "player.vimeo.com") {
    vimeoId = url.pathname.split("/").filter(Boolean)[1] ?? null; // /video/<id>
  }
  if (vimeoId && /^\d+$/.test(vimeoId)) {
    return { provider: "vimeo", src: `https://player.vimeo.com/video/${vimeoId}` };
  }

  return null;
}
