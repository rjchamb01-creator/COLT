// Renders a drill's video: an inline privacy-respecting embed when we recognise
// the provider (YouTube nocookie / Vimeo), otherwise a plain external link so we
// never embed an arbitrary origin in a youth product. Server component — it's
// just an <iframe>, no client JS needed. Renders nothing when there's no url.
import { toVideoEmbed } from "@/lib/video";

export function DrillVideo({
  url,
  title,
}: {
  url: string | null;
  title: string;
}) {
  if (!url) return null;

  const embed = toVideoEmbed(url);
  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 text-sm font-medium text-steel hover:underline"
      >
        Watch video →
      </a>
    );
  }

  return (
    <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black/40">
      <iframe
        src={embed.src}
        title={`${title} — video`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}
