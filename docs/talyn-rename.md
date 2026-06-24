# Task: Rename product "NextGen Athlete" → "Talyn" — ✅ COMPLETE

> **Status: VERIFIED COMPLETE (2026-06-19).** Every shippable artifact — package name,
> UI/route strings, page titles, the logo wordmark, metadata/manifest/icons, and Supabase config —
> now says **Talyn**. An authoritative sweep
> (`rg -i "nextgen|next-gen|next gen" --glob '!.next/**' --glob '!node_modules/**'`) finds **no
> product-name hits in source** — only the intentionally-preserved exceptions below.
>
> The brand is **Talyn**, tagline **"Level up your game."**, pronounced **TAL-in** (see `BRAND.md`).

## Intentionally NOT renamed (correct as-is)

- **Real document filenames** — `NextGen_Athlete_Validation_Report.docx`, `_Validation_Deck.pptx`,
  `_Financial_Model.xlsx`, `NextGen_Athlete_Business_Case.docx`. These are actual files; references
  to them stay (one such reference remains in `CLAUDE.md` prose and in `.claude/settings.local.json`
  bash-permission entries — both correct).
- **`BRAND.md`** — deliberately mentions the old name when explaining the rename. Leave.

## Done — verified

- [x] `package.json` + `package-lock.json` — `"name": "talyn"`.
- [x] All page titles — `Log in · Talyn`, `Sign up · Talyn`, `Set up your club · Talyn`,
      `Dashboard · Talyn`, `The Ladder · Talyn`, `Training Library · Talyn` (and the newer routes:
      `The Squad · Talyn`, `The Matchday Challenge · Talyn`, `Engagement Insights · Talyn`,
      `AI Coach · Talyn`).
- [x] `src/app/layout.tsx` root metadata — `"Talyn — Level up your game"`, icons/manifest/openGraph
      + `viewport.themeColor` wired.
- [x] `src/components/logo.tsx` — renders the two-tone `TAL`(white)/`YN`(lime) wordmark; the old
      `NEXTGEN`/`ATHLETE` spans are gone.
- [x] `src/app/globals.css` + `src/lib/types.ts` header comments — say "Talyn".
- [x] `public/site.webmanifest` + `public/brand/` assets — Talyn; no stale name in `public/`.
- [x] `supabase/config.toml` — `project_id = "talyn"`; migration header comments clean.
- [x] `CLAUDE.md` prose — product name is Talyn (only the validation-doc *filename* remains, by design).

## Optional / not required

- [ ] **Design-token prefix `--ng-*` → `--talyn-*`** — a large find/replace across `globals.css` and
      every component (`text-ng-lime`, `bg-ng-navy`, …). Purely cosmetic, **not** part of the brand
      rename. Do it on its own branch if ever wanted; `BRAND.md` explicitly says the `ng-` prefix can
      stay to avoid codebase-wide churn.

## Housekeeping flagged (not auto-applied — pre-existing, not created by this task)

- [x] **`CLAUDE.md.bak`** — stale pre-edit backup at the repo root. Deleted (2026-06-19).
- [ ] **`.next/` build cache** — stale dev chunks still contain old strings; they regenerate on the
      next `npm run build` / `npm run dev` and are not shipped.
