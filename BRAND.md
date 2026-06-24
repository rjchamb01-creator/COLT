# BRAND.md — COLT

> **TODO (blocker):** Name **COLT** is pending formal trade-mark + domain clearance. Hold further
> asset spend on the name until that clears. (Don't act on this here.)

Brand reference for building the app. Keep UI, copy, and naming consistent with this.

## Audience — the two-tier model (one brand)

**8–13 is the core market** — that's where parents pay and coaches influence. Past 13 kids
self-direct and only the dedicated stay, so 13+ is a *different, opt-in* experience, not the
default. One brand, two tiers:

| | **Colts · 8–13** (core / the business) | **Seniors · 13+** (graduation / opt-in) |
|---|---|---|
| In control | Parent- & coach-led | Self-driven athlete |
| Feel | Playful, colourful, rewarding | Lean, serious, performance-focused |
| Palette | Ink/Bone + Signal Red **plus a small play-palette** for reward moments | **Strict blackout** — Ink/Bone + Signal Red only (~5%) |
| Voice | Colt register: younger, simpler, lots of encouragement | Senior register: the lean captain |
| Lexicon | XP · Tiers · Ladder · Badges · Heat · Squad · Matchday Challenge | same terms, leaner phrasing |
| Goal | Build the habit; make training feel like play | Sharpen the edge; chase the rank |

**Principle — intensity is the graduation signal.** Brightness and play for Colts; stripped-back
blackout for Seniors — so "levelling up" to 13+ literally *looks and sounds* more serious. This
rides the existing colt → senior-grade motif. Sequence: **build Colts first, Seniors later** (this
pass only documents the model — it does not build the Seniors product).

Feel: **bold, energetic, game-like — hype but never fake.** Sell the *feeling of rising through the
ranks*, not the AI.

> **Name:** COLT (chosen for the rebrand from "Talyn"). Short, ownable, athletic.
> **Pronunciation:** "colt" (rhymes with *bolt*).
> **Name story (motif):** a *colt* is a young horse — fast, raw, on the rise, growing into the
> senior grades. It carries the whole promise in one word: you start as a colt and **rise through
> the ranks**. Use sparingly as a secondary idea; the primary mark is the **COLT wordmark** (with
> the red "O") and the **C-tile** app icon.
> **Before launch:** run a formal trade-mark search and secure the domain.

## Essence

- **Name:** COLT (always all-caps in the logo; "Colt" is acceptable in running prose).
- **Tagline:** Rise through the ranks. *(the one primary line — use it everywhere)*
- **Rally cry:** Sharpen up.
- **Promise:** Every session makes you better — and it feels like play.
- **Pillars:** Progress you can see · Play that earns rewards · Pride in your squad.

## Colour tokens

A deliberately minimal palette: Ink carries the brand, Signal Red is the single accent (used
sparingly), Bone and Steel do the quiet work. Built for dark mode. On-screen values.

| Token | Hex | Role |
|-------|-----|------|
| `--color-ink` | `#0B0B0C` | Primary brand / text / dark-mode base |
| `--color-bone` | `#F4F2EC` | Light surfaces, text on ink |
| `--color-signal` | `#FF2E1F` | Energy accent — CTAs, level-ups, Heat, progress fill. **Use sparingly (~5%).** |
| `--color-steel` | `#6B7280` | Secondary / muted UI text, captions, secondary tags |

Usage rules: Signal Red is the **spark** — one primary action per screen, level-up and Heat
moments, the single highlight; never large fills or a second accent. Ink carries the brand; Bone
and Steel do everything else.

### Tailwind v4 (CSS-first) — in `src/app/globals.css`

```css
@theme {
  --color-ink:    #0b0b0c;
  --color-bone:   #f4f2ec;
  --color-signal: #ff2e1f;
  --color-steel:  #6b7280;
}
```

Then use `bg-ink`, `text-bone`, `bg-signal`, `text-steel`, etc. (Tailwind 4 generates utilities
from `@theme` — no `tailwind.config.js`.) Opacity modifiers work as usual (`text-bone/70`,
`border-signal/30`). Neutral overlays use plain `white`/`black` with low opacity
(`border-white/10`, `bg-white/[0.03]`) — palette-agnostic, leave as-is.

### Play-palette — Colts reward moments ONLY

A small, bright play-palette layered **on top of** the core tokens, for **8–13 reward surfaces
only**: tier-ups, badges, level-ups, and celebration moments. Defined in `globals.css` alongside
the core tokens.

| Token | Hex | Role |
|-------|-----|------|
| `--color-play-1` | `#9BE34A` | Lime — primary play accent (rewards/celebrations) |
| `--color-play-2` | `#4CC2FF` | Sky — secondary play accent |
| `--color-play-3` | `#FFB23E` | Amber — tertiary play accent |

Rules:
- Use **only** for Colt (8–13) reward/celebration moments — never for brand, marketing, or chrome.
- **Brand, marketing, and the entire Seniors (13+) experience keep the strict single-accent rule**
  (Ink/Bone + Signal Red, ~5%). The play-palette is the intensity dial that says "you're a Colt".
- These tokens are *established* here for use as reward surfaces are built; existing colour usage is
  **not** being refactored onto them in this pass.

## Logo & motif

React components (the source of truth):
- `src/components/brand/Logo.tsx` — the **COLT wordmark**. The four letters use `currentColor`
  (so the logo inherits the surrounding text colour on dark/light); the **"O" is always Signal
  Red** — the wordmark's *only* accent. Never recolour the other letters or add a second accent.
  Pass `className` to size/colour (e.g. `h-7 w-auto text-bone`).
- `src/components/brand/ColtIcon.tsx` — the **app icon**: a red "C" on an Ink rounded-square tile.

Static assets in `public/brand/`:
- `colt-wordmark.svg` (bone letters, red O), `colt-icon.svg` (C-tile), `colt-icon-maskable.svg`
  (full-bleed ink for Android maskable), `favicon.svg`, `og-image.svg`.
- Generated PNGs (from the C-tile via `sharp`): `favicon-16/32/48.png`, `apple-touch-icon-180.png`,
  `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `og-image.png` (1200×630), `avatar-1000.png`.

Wiring lives in `src/app/layout.tsx` (`metadata.icons` + OG) and `public/site.webmanifest`
(`name`/`short_name`/icons). Theme colour is Ink `#0B0B0C`.

Design:
- **Wordmark:** `COLT` — bold condensed uppercase, the "O" picked out in Signal Red.
- **App icon:** the COLT "C" in Signal Red on an Ink rounded-square tile.
- **Motif:** the "rise" / climb device — an upward-chevron texture used for progress fills and
  section dividers (`.climb-fill` / `.climb-divider` in `globals.css`). Reads as *rising through
  the ranks*.

## Typography

- **Display / headlines / big numbers:** **Saira Condensed** (600/700). Uppercase for impact.
- **Body / UI:** **Archivo** (400/500/700).
- Loaded via `next/font` (self-hosted) in `src/app/layout.tsx` as CSS variables
  (`--font-saira-condensed`, `--font-archivo`), wired to `--font-display` / `--font-sans` in
  `globals.css`. Headlines tight-tracked and punchy; UI text readable on small screens.

## Gamification language (the moat — use these exact terms in UI and ideally in code)

| Concept | Brand term | Notes |
|---------|-----------|-------|
| Earned points | **XP** | Universal. |
| Levels / progression | **Tiers** | Rookie → Rising → Starter → Pro → Elite → Legend |
| Leaderboard | **The Ladder** | Mirrors real comp ladders. "Climb the ladder." |
| Achievements / badges | **Badges** | "Earn your badges." (UI word only — DB/types stay `caps`/`Cap`.) |
| Streak | **Heat** / On Fire 🔥 | "keep showing up" mechanic |
| Weekly challenge | **Matchday Challenge** | The one public name. ("the Set" is internal/code only — never shown in UI.) |
| Team / friends | **Squad** | training crew inside the app |

Keep these **sport-neutral** — the pilot is QLD basketball, so no rugby-only terms (ruck, scrum,
play-the-ball) in user-facing copy. Ladder · XP · Tiers · Squad · Heat read across every sport.

System one-liner: **Climb the ladder. Earn your badges. Sharpen up.**

Naming suggestion for code: prefer these terms in user-facing strings and component/route names
where natural (e.g. `Ladder`, `TierBadge`, `StreakFlame`, `Squad`) so the brand and the codebase
stay in sync.

## Voice (UI copy)

Voice = an **encouraging captain**: hypes you up, tells it straight, never talks down. Second
person, active verbs, short lines.

**Do**
- "You're on fire — 7-day streak."
- "Top of the ladder is empty. Go take it."
- "20 minutes to a sharper first touch."
- "Level up! You just hit Pro tier."

**Don't**
- "You have maintained a 7-day activity streak."
- "Complete Training Module 4 to improve ball control."
- "Don't fall behind the other kids." (never use fear)

**Three registers** (match the audience and the tier)
- **Colt (8–13, the default):** younger, simpler reading level, lots of encouragement. Short, warm,
  celebratory. "Nice — that's a new badge. Go again?"
- **Parent (proof of value, calmer):** quiet confidence, evidence over hype. "3 sessions, 2 new
  badges this week — Mia's building a real habit."
- **Senior (13+, the lean captain):** stripped-back, direct, performance-first. "Top of the ladder's
  empty. Go take it." No baby-talk, less exclamation, same momentum.
- **Club:** "Give your players a reason to train all week — free for your club."

**Hype budget.** Hype is earned, not sprayed. Celebrate the moments that actually matter — a tier-up,
a new badge, a Heat milestone, a finished Matchday Challenge — and stay calm everywhere else. If every
screen shouts, nothing lands. Seniors get an even tighter budget than Colts.

## Quick rules

1. The brand name is **COLT** (all-caps in the logo; "Colt" acceptable in prose).
2. Lead with the feeling of rising through the grades, not the technology.
3. Talk to the kid first; reassure the parent; flatter the club.
4. Signal Red is the spark — one primary action per screen, ~5% of the surface. Never a second accent.
5. Use the gamification vocabulary consistently: Ladder, Badges, Tiers, XP, Squad, Heat.
6. Never fear ("fall behind") — always momentum ("rise"). Spend the hype budget on moments that earn it.

> **Codebase note:** all shippable code/strings/metadata now say "COLT"; the design tokens are
> `--color-ink` / `--color-bone` / `--color-signal` / `--color-steel` (these replaced the old
> `--color-ng-*` palette), and the fonts are Saira Condensed + Archivo. Internal identifiers left
> as-is from the previous name (npm package name, Supabase project id, migration comment headers)
> are intentional and carry no user-facing brand.
>
> **User-facing lexicon vs. code (don't conflate):** the UI says **Badges** and **Matchday
> Challenge**; the database and TypeScript keep `caps` / `athlete_caps` / `cap_id` / `Cap` /
> `AthleteCap` / `new_caps`, the `matchday` enum value, and the "Set" code/comment terms in
> `lib/challenge.ts` / `program.ts` exactly as they are. Only displayed words changed — renaming the
> identifiers risks breakage (same rule the COLT rename followed).
