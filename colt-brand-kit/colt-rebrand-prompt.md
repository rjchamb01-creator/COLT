# Claude Code prompt — rebrand Talyn → COLT

Paste everything in the block below into Claude Code (run it from the app repo root).

---

We're rebranding this app from "Talyn" to "COLT". Do a careful, repo-wide rebrand of the
user-facing brand identity. Read AGENTS.md, CLAUDE.md, and BRAND.md FIRST, then plan before editing.

## Scope / order of work
1. Start by grepping the repo for every occurrence of "Talyn"/"talyn" (case-insensitive) across
   code, JSX, metadata, BRAND.md, CLAUDE.md, README, manifest, and comments. Show me the list and
   a short plan before making changes.
2. Replace the user-facing brand name "Talyn" with "COLT" everywhere it appears as a brand
   (UI copy, `<title>`/metadata, Open Graph, manifest name/short_name, email templates, BRAND.md).
3. Do NOT rename internal identifiers that would risk breakage unless trivial and safe: leave the
   npm package name, Supabase project/table/column names, env var names, and route paths as-is.
   If you think an internal rename is worth it, list it separately as an optional follow-up — don't
   do it in this pass.

## Brand specifics to apply
- **Name:** COLT (always all-caps in the logo; "Colt" acceptable in running prose).
- **Tagline:** "Rise through the grades".
- **Palette** — update the Tailwind v4 CSS-first theme tokens in src/app/globals.css (these replace
  the old Talyn colours):
  - Ink (primary/text/bg-dark): #0B0B0C
  - Bone (light bg): #F4F2EC
  - Signal Red (accent — use sparingly, ~5%): #FF2E1F
  - Steel (secondary/muted UI text): #6B7280
  Wire these as CSS variables + Tailwind theme colors (e.g. --color-ink, --color-bone,
  --color-signal, --color-steel) and refactor existing colour usages to them.
- **Type:** load via next/font (self-hosted Google Fonts):
  - Headlines/display: "Saira Condensed" (600/700)
  - UI + body: "Archivo" (400/500/700)
  Set these as CSS variables and apply Saira Condensed to headings, Archivo to body.
- **Gamification lexicon stays unchanged:** Ladder, Caps, Tiers, XP, Squad, Heat. Keep BRAND.md's
  athlete-first voice; just swap the name/colours/type.

## Logo — create a reusable React component
Create `src/components/brand/Logo.tsx` (and a `ColtIcon.tsx`) using the exact vector below. The
four letters use `currentColor` (so the logo inherits text colour on dark/light); the "O" is always
Signal Red. Provide a `className` passthrough.

Wordmark (`Logo.tsx`):
```jsx
<svg viewBox="-18 -18 310 156" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="COLT" className={className}>
  <path d="M43.66 17.6 A22 50 0 1 0 43.66 102.4" fill="none" stroke="currentColor" strokeWidth="20"/>
  <path d="M68 60 A32 60 0 1 0 132 60 A32 60 0 1 0 68 60 Z M88 60 A12 40 0 1 0 112 60 A12 40 0 1 0 88 60 Z" fill="#FF2E1F" fillRule="evenodd"/>
  <path d="M146 0 H166 V100 H196 V120 H146 Z" fill="currentColor"/>
  <path d="M210 0 H274 V20 H252 V120 H232 V20 H210 Z" fill="currentColor"/>
</svg>
```

App icon (`ColtIcon.tsx`) — red "C" on an ink rounded-square tile:
```jsx
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="COLT" className={className}>
  <rect width="200" height="200" rx="46" fill="#0B0B0C"/>
  <g transform="translate(74,35) scale(1.083)">
    <path d="M43.66 17.6 A22 50 0 1 0 43.66 102.4" fill="none" stroke="#FF2E1F" strokeWidth="20"/>
  </g>
</svg>
```

Replace the old Talyn logo wherever it's used (nav/header, auth pages, onboarding, emails). Generate
a favicon/app-icon and PWA manifest icons from ColtIcon (ink tile, red C). Keep the wordmark's only
accent the red O — never recolour other letters or add a second accent.

## Verify before finishing
- `npm run build` passes (this also typechecks) and `npm run lint` is clean.
- Grep confirms no stray user-facing "Talyn" remains (call out any intentionally-left internal refs).
- Show me a summary diff of brand-related changes and a list of files touched.
