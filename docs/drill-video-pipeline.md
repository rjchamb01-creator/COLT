# Drill Video — content plan & (later) voiceover pipeline

**Status:** plan-of-record for drill video. Stage 0 needs **no build** and can ship now. Stage 1
is a *later* enhancement, designed but deliberately not built yet.

## Direction (decided)

The free Training Library should have **real video** of drills. We don't have a production crew,
so:

- **The movement demo is real footage** — the owner films athletes (initially his own kids)
  doing the drill. Real footage means correct technique, an authentic on-brand feel ("real, never
  fake"), and clean rights (own children, own footage). This sidesteps AI-generated *motion*,
  which can't be trusted to show a *correct* drill technique to minors.
- **AI's only job is narration**, and only once manual narration becomes the bottleneck. A
  branded coach **voiceover** (AI text-to-speech) layered over the filmed clip — never an AI
  *avatar* (we want a voice, not a synthetic talking head) and never AI-generated *movement*.
- **Humans approve everything.** Unchanged from `approveDraftDrill`: nothing reaches the youth
  library until a person has watched the clip and clicked approve. The AI here is a capacity tool,
  not the author — this does not change who is accountable for the content.

This supersedes the earlier "nocookie embeds of third-party clips" sketch and the earlier
HeyGen-avatar sketch. The reusable plumbing from the HeyGen sketch is preserved below in Stage 1;
the avatar itself is dropped.

Playback already exists: `drills.video_url` + `toVideoEmbed` (`src/lib/video.ts`) +
`DrillVideo` (`src/components/drill-video.tsx`), wired into `/dashboard/training`.

---

## Stage 0 — ship real video now (ZERO build)

The fastest path needs nothing new:

1. Film the drill **with live narration** (talk over it while recording).
2. Upload **unlisted** to YouTube or Vimeo.
3. Paste the link into the **`video_url`** field in the existing authoring UI
   (`/dashboard/library`).

`DrillVideo`/`toVideoEmbed` already render unlisted YouTube/Vimeo as a privacy-respecting
(nocookie) inline embed. Content is live in the free library immediately, and it starts feeding
the "most-watched / most-logged drills" signal in `/dashboard/insights`.

**Trade-off:** unlisted YouTube/Vimeo means hosting on Google/Vimeo rather than infra we own.
For library content shown to every squad (not private), that's an acceptable v1 trade and it gets
real usage data without a build. Self-hosting is the Stage-1 concern below.

**Do this first.** It costs nothing and answers the only question that matters before building a
pipeline: *do athletes actually watch the videos?*

---

## Stage 1 — AI voiceover layer (LATER, only if manual narration is the bottleneck)

Build this only when narrating every clip yourself doesn't scale, or you want one consistent
branded coach voice across hundreds of clips. Shape:

```
film clip SILENT ──► Claude drafts VO script (reviewed) ──► AI voice renders audio
                                                                     │
                          composite audio-over-video (the new piece) ▼
                                                              render mp4 (async)
                                                                     │
                                                self-host in Supabase Storage
                                                                     ▼
                                  job = "ready" ──► staff reviews ──► approve
                                                                     │
                                                  drills.video_url = <storage url>
```

Two things that were in the avatar sketch **change**:

- **No HeyGen avatar.** The engine is a **voice / TTS** tool (ElevenLabs-class voice cloning is
  the natural pick — cheaper and better at pure narration than an avatar product). Mirror the
  `anthropic.ts` pattern: server-only, lazy singleton, `PLACEHOLDER_KEY`, `isVoiceConfigured()`
  gate so the app builds/runs without a key. Env: `ELEVENLABS_API_KEY` (or chosen provider).
- **A compositing step is new** — laying the VO audio onto the filmed video to produce one mp4.
  This is the genuinely new infrastructure and the reason Stage 1 is "later": options are ffmpeg
  in a background worker, or a media API (Shotstack / Cloudinary Video / Mux). Pick during build.
  Because compositing/render is minutes-long and exceeds Vercel Server Action / Route Handler
  timeouts, it must run **detached** (same async shape as `rotate_weekly_sets`), with completion
  written back to the DB — never inline like `draftDrills`.

### 1. Claude drafts the voiceover script (`src/lib/drill-video-script.ts`)

Mirrors `draftDrills`: server-only, `DRAFT_MODEL` (Sonnet), structured output via
`zodOutputFormat`, the same youth-safety system-prompt discipline, and **human review before
render**. The script feeds the **voiceover** (it is read aloud), not on-screen avatar text. Cap
length to the clip — speech is ~150 wpm, so a 45s clip ≈ 110 words.

```ts
// src/lib/drill-video-script.ts — SERVER-ONLY (imports the Anthropic client).
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DRAFT_MODEL, getAnthropic, isCoachConfigured } from "@/lib/anthropic";
import { AGE_GROUP_LABELS, SPORT_LABELS, type Drill } from "@/lib/types";

const SCRIPT_SYSTEM = `You write the SPOKEN VOICEOVER for a short coaching video that explains ONE
youth training drill (athletes ~8–16) for COLT. The video shows REAL footage of the drill; your
words are narrated over it.

Rules:
- Plain, encouraging, athlete-first voice (see brand tone). No jargon a 10-year-old wouldn't get.
- Narrate how to set up and run the drill, then one coaching cue to do it well.
- Safe and age-appropriate. Never invent stats, brands, or links.
- READ ALOUD — no headings, no bullet symbols, just spoken sentences.
- HARD LIMIT: stay under the word budget given (it controls the clip length).`;

const ScriptSchema = z.object({
  on_screen_title: z.string(), // optional lower-third title
  script: z.string(),          // the spoken VO
  coaching_cue: z.string(),    // a lower-third callout
});
export type DrillScript = z.infer<typeof ScriptSchema>;

export async function draftDrillScript(
  drill: Pick<Drill, "title" | "description" | "duration_min" | "sport" | "age_group">,
  skillLabels: string[],
): Promise<{ ok: true; script: DrillScript } | { ok: false; message: string }> {
  if (!isCoachConfigured()) return { ok: false, message: "AI isn't switched on yet." };
  const wordBudget = 110; // ~45s clip; tune per clip length
  const user = `Sport: ${SPORT_LABELS[drill.sport]}
Age group: ${AGE_GROUP_LABELS[drill.age_group]}
Drill: ${drill.title}
How it works: ${drill.description}
Skills: ${skillLabels.join(", ") || "n/a"}
Word budget for the spoken script: ${wordBudget} words max.`;
  try {
    const msg = await getAnthropic().messages.parse({
      model: DRAFT_MODEL,
      max_tokens: 1024,
      system: SCRIPT_SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { format: zodOutputFormat(ScriptSchema) },
    });
    if (!msg.parsed_output) return { ok: false, message: "No script returned. Try again." };
    return { ok: true, script: msg.parsed_output };
  } catch {
    return { ok: false, message: "The script drafter hit a snag. Try again." };
  }
}
```

### 2. Job table (tracks each async render) + Storage

```sql
create type public.video_job_status as enum
  ('queued','processing','ready','failed','approved');

create table public.drill_video_jobs (
  id            uuid primary key default gen_random_uuid(),
  drill_id      uuid not null references public.drills (id) on delete cascade,
  club_id       uuid references public.clubs (id) on delete cascade, -- denormalised, like drill_skills
  status        public.video_job_status not null default 'queued',
  script        jsonb,            -- the reviewed VO script
  source_url    text,            -- the filmed (silent) clip uploaded by the owner
  audio_url     text,            -- rendered VO audio
  output_url    text,            -- composited mp4 in Supabase Storage
  provider_job_id text,          -- id from the voice/compositing provider
  error         text,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index drill_video_jobs_drill_idx  on public.drill_video_jobs (drill_id);
create index drill_video_jobs_status_idx on public.drill_video_jobs (status);

alter table public.drill_video_jobs enable row level security;

create policy drill_video_jobs_select on public.drill_video_jobs
  for select using (
    club_id is null
    or club_id = public.current_club_id()
    or public.current_role() = 'admin'
  );

-- FIX vs the earlier sketch: the INSERT/UPDATE check must ALSO constrain club_id
-- (a `with check` that only checks role lets a coach write a job for club_id NULL
-- (global) or another club). Match the drills_insert gate exactly.
create policy drill_video_jobs_write on public.drill_video_jobs
  for all using (
    public.current_role() = 'admin'
    or (club_id = public.current_club_id()
        and public.current_role() in ('coach','club_admin'))
  ) with check (
    public.current_role() in ('coach','club_admin','admin')
    and (
      club_id = public.current_club_id()
      or (club_id is null and public.current_role() = 'admin')
    )
  );
```

- Create a **`drill-videos` Storage bucket**. Storage is **not used anywhere in the app yet** —
  this is net-new infra. **Decision to make:** a *public* bucket (`getPublicUrl`) is simplest but
  the URL is guessable by anyone; **signed URLs** keep youth content access-controlled (the
  privacy-first stance behind `video.ts`) at the cost of expiry handling in the `<video>` tag.
  For minors' content, lean signed unless there's a reason not to.
- Add `video_job_status` + `drill_video_jobs` (Row + Insert) to the `Database` type in
  `src/lib/types.ts`, or typed queries silently collapse to `never` (the CLAUDE.md gotcha). Add a
  `drill_video_requested` value to `ActivityAction` (`src/lib/activity.ts`) and a label in the
  Insights `ACTION_LABELS`, mirroring `drill_created`.

### 3. Enqueue (Server Action, staff-only)

Drafts the VO script, persists a `queued` job (so the completion handler can find it), then kicks
off the detached render. Does **not** wait for it. `isStaff` currently lives un-exported in
`library/actions.ts` — hoist it to a shared module (e.g. `src/lib/roles.ts`) for reuse. Note the
sketch fetches `drill_skills(skills(label))` so pass the real labels into `draftDrillScript`.

### 4. Completion handler → self-host → `ready`

When the render/composite finishes, a handler (a provider **webhook** Route Handler, or a
`pg_cron` worker that polls a sync compositor) downloads the mp4, uploads it to
`drill-videos/<drill_id>/<jobId>.mp4`, and sets `status='ready'` + `output_url`. Requirements:

- **If it's a webhook, signature verification is MANDATORY, not a TODO.** The endpoint is public
  and triggers a privileged write; an unverified handler lets a forged payload point the download
  at attacker-controlled content that gets uploaded to your Storage (human approve is only a
  backstop). Verify the provider signature and reject on mismatch before doing anything.
- Use a **service-role** Supabase client (no user session in a webhook) — `SUPABASE_SERVICE_ROLE_KEY`
  is a high-privilege secret that bypasses RLS; treat it like the Anthropic key (server-only,
  never bundled). There is **no service-role client in the project today** — it's net-new.
- **Handle failure + idempotency:** map the provider's failure event to `status='failed'` (else
  jobs hang in `processing` forever), and only transition `processing → ready` (don't let a
  retried completion event regress an already-`approved` job).

### 5. Approve → write `drills.video_url` (human-in-the-loop gate)

Identical philosophy to `approveDraftDrill`. Uses the **user session** (so `drills_update` RLS
applies). Note: a **global** drill (`club_id IS NULL`) is admin-only to update — a coach approving
a global clip would silently affect 0 rows, so check role and surface a clear message.

```ts
export async function approveDrillVideo(jobId: string) {
  const current = await getCurrentUser();
  if (!isStaff(current)) return { ok: false, error: "Coaches and admins only." };
  const supabase = await createClient();
  const { data: job } = await supabase.from("drill_video_jobs")
    .select("drill_id, output_url, status, club_id").eq("id", jobId).single();
  if (!job || job.status !== "ready" || !job.output_url)
    return { ok: false, error: "Clip isn't ready to approve." };
  if (job.club_id === null && current!.profile?.role !== "admin")
    return { ok: false, error: "Global drills are admin-approved." };
  await supabase.from("drills").update({ video_url: job.output_url }).eq("id", job.drill_id);
  await supabase.from("drill_video_jobs").update({ status: "approved" }).eq("id", jobId);
  revalidatePath("/dashboard/library");
  revalidatePath("/dashboard/training");
  return { ok: true };
}
```

### 6. Playback — extend `toVideoEmbed` for self-hosted mp4

`toVideoEmbed` returns `null` for non-YouTube/Vimeo today. Add a branch that recognises ONLY your
Storage origin (keep the allow-list strict — never an arbitrary host) and returns a self-hosted
source; `drill-video.tsx` renders a `<video controls>` for it.

```ts
export type VideoEmbed =
  | { provider: "youtube" | "vimeo"; src: string }
  | { provider: "file"; src: string };

// after the youtube/vimeo branches, before `return null`:
if (host.endsWith(".supabase.co") && url.pathname.includes("/drill-videos/")) {
  return { provider: "file", src: url.toString() };
}
```

---

## Rights, consent & safeguarding

- **Own children, own footage = clean** for Stage 0/1 as the owner films his own kids.
- **Scaling to filming other clubs' kids is a different regime** — media consent and youth
  safeguarding obligations apply. Design for it (per-athlete media-consent capture, restricted
  visibility) *before* that happens; it is out of scope while filming own children.

## Cost & scale (Stage 1)

- TTS (ElevenLabs-class) bills per character/second — cheap relative to avatar/video generation.
- Compositing cost depends on the chosen tool (ffmpeg worker = compute only; media API = per-min).
- **Idempotency at batch:** skip drills that already have an `approved`/`ready` job (mirror the
  "already has a live Set this week" guard in `rotate_weekly_sets`); a `pg_cron` drainer paces N
  `queued` jobs/run.

## Build order (Stage 1, when triggered)

1. Decide: signed vs public bucket; voice provider; compositing approach (ffmpeg worker vs media API).
2. Migration: `drill_video_jobs` + enum; add to `types.ts`; create `drill-videos` bucket; hoist `isStaff`.
3. `src/lib/voice.ts` (TTS client + `isVoiceConfigured()` gate + env) and `drill-video-script.ts`.
4. Upload UI for the silent clip + `requestDrillVideo` action + a "Generate voiceover" button in `library-manager.tsx`.
5. Completion handler (webhook **with signature verification** or pg_cron worker) + service-role client + Storage upload + failure/idempotency.
6. Review/approve UI (list `ready` jobs, embed the clip, Approve) → `approveDrillVideo`.
7. Extend `toVideoEmbed` + `drill-video.tsx` for self-hosted mp4.
8. Batch enqueue + `pg_cron` drainer for scale.
