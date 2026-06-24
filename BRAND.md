# BRAND.md — COLT

Brand reference for building the app. Keep UI, copy, and naming consistent with this.
Audience priority: **young athletes first** (8–16), then parents (payer), then clubs (channel).
Feel: **bold, energetic, game-like — hype but never fake.** Sell the *feeling of rising through
the grades*, not the AI.

> **Name:** COLT (chosen for the rebrand from "Talyn"). Short, ownable, athletic.
> **Pronunciation:** "colt" (rhymes with *bolt*).
> **Name story (motif):** a *colt* is a young horse — fast, raw, on the rise, growing into the
> senior grades. It carries the whole promise in one word: you start as a colt and **rise through
> the grades**. Use sparingly as a secondary idea; the primary mark is the **COLT wordmark** (with
> the red "O") and the **C-tile** app icon.
> **Before launch:** run a formal trade-mark search and secure the domain.

## Essence

- **Name:** COLT (always all-caps in the logo; "Colt" is acceptable in running prose).
- **Tagline:** Rise through the grades.
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
  the grades*.

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
| Achievements / badges | **Caps** | "Earn your caps." Sporting resonance (earning a cap = representing). |
| Streak | **Heat** / On Fire 🔥 | "keep showing up" mechanic |
| Weekly challenge | **Matchday Challenge** | (a.k.a. "the Set" — nod to a set of six in league) |
| Team / friends | **Squad** | training crew inside the app |

System one-liner: **Climb the ladder. Earn your caps. Sharpen up.**

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

**By audience**
- **Athlete (default):** bold, momentum, game language.
- **Parent (proof of value, calmer):** "See how Mia's progressing this week — 3 sessions, 2 new caps."
- **Club:** "Give your players a reason to train all week — free for your club."

## Quick rules

1. The brand name is **COLT** (all-caps in the logo; "Colt" acceptable in prose).
2. Lead with the feeling of rising through the grades, not the technology.
3. Talk to the kid first; reassure the parent; flatter the club.
4. Signal Red is the spark — one primary action per screen, ~5% of the surface. Never a second accent.
5. Use the gamification vocabulary consistently: Ladder, Caps, Tiers, XP, Squad, Heat.
6. Never fear ("fall behind") — always momentum ("rise").

> **Codebase note:** all shippable code/strings/metadata now say "COLT"; the design tokens are
> `--color-ink` / `--color-bone` / `--color-signal` / `--color-steel` (these replaced the old
> `--color-ng-*` palette), and the fonts are Saira Condensed + Archivo. Internal identifiers left
> as-is from the previous name (npm package name, Supabase project id, migration comment headers)
> are intentional and carry no user-facing brand.
