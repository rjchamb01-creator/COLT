#!/usr/bin/env node
/**
 * update-claude-md-freemium.mjs
 *
 * Inserts the decided "Freemium model & go-to-market" subsection into CLAUDE.md's
 * "Product context (from docs/)" section, right before "## Planned integrations".
 *
 * Safe to run repeatedly:
 *   - Idempotent: if the section marker already exists, it rewrites that block in place
 *     instead of duplicating it.
 *   - Backup: writes CLAUDE.md.bak before changing anything.
 *
 * Usage:
 *   node scripts/update-claude-md-freemium.mjs            # updates ../CLAUDE.md (repo root)
 *   node scripts/update-claude-md-freemium.mjs <path>     # updates an explicit file
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const target = resolve(process.argv[2] ?? resolve(scriptDir, "..", "CLAUDE.md"));

const HEADING = "### Freemium model & go-to-market (decided June 2026)";
const ANCHOR = "## Planned integrations";

const BLOCK = `${HEADING}

The $9.99/mo subscription is delivered as **freemium**, with the free/paid line following a
**collective-vs-individual** split. The engagement loop + gamification is the moat, and loops
need squad-wide density — so everything that builds network effects is free, and monetization
sits on the individual athlete's edge layered on top.

- **Free — the collective layer (builds audience + the moat):** profiles, squad membership and
  join-by-code, the core/global Training Library, club communications and scheduling, the squad
  feed, and *social* gamification — earning XP, squad leaderboards, streaks (Heat), basic Tiers.
  This is also what the club promotes with zero friction. **Never paywall club comms or squad
  participation** — gating the loop kills the network effect and the club's reason to push it.
- **Paid ($9.99/mo) — the individual layer (drives conversion):** personalised Weekly Programs
  (the strongest recurring-value driver), full personal Ladder progression + individual
  challenges, the deeper/position-specific library, AI Coach (kept secondary per positioning),
  and parent insight dashboards (progress, attendance, development tracking). The payer is the
  parent, so parent-facing visibility is a primary willingness-to-pay lever; conversion is
  **per-athlete**, which is why parent conversion is the headline KPI.
- **Rollout — start free, build audience:** **Phase 1 (now)** ship everything free and don't
  build the paywall yet — the goals are landing whole clubs/squads, proving the loop, and
  gathering data on which features people lean on (that data decides where the paywall goes).
  **Phase 2** introduce premium around the most-used features (expected: Weekly Programs +
  personal progression + parent insights), grandfathering early adopters where reasonable.
  **Phase 3** marquee-athlete content (e.g. a Reece Walsh program) as a premium acquisition hook,
  bundled into the subscription.
- **Marketplace — RULED OUT.** A two-sided creator marketplace (athletes/coaches selling their
  own paid programs) is *not* the direction: cold-start dynamics, youth safeguarding/liability,
  and club channel-conflict make it a poor near-term fit. Star-athlete pull is **secondary** and
  lives in Phase 3 as a marketing/acquisition layer bundled into the sub — not a paid marketplace.

`;

if (!existsSync(target)) {
  console.error(`✗ Not found: ${target}`);
  process.exit(1);
}

const original = readFileSync(target, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
// Normalise to \n for processing; restore EOL on write.
const text = original.replace(/\r\n/g, "\n");

const anchorIdx = text.indexOf(`\n${ANCHOR}`);
if (anchorIdx === -1) {
  console.error(`✗ Anchor "${ANCHOR}" not found — CLAUDE.md structure changed; aborting.`);
  process.exit(1);
}

let updated;
if (text.includes(HEADING)) {
  // Idempotent rewrite: replace the existing block (heading up to the anchor).
  const start = text.indexOf(HEADING);
  const end = text.indexOf(`\n${ANCHOR}`, start);
  updated = text.slice(0, start) + BLOCK + text.slice(end + 1);
  console.log("• Existing freemium section found — rewriting it in place.");
} else {
  // Insert the block immediately before the anchor heading.
  const insertAt = anchorIdx + 1; // keep the leading newline before the anchor
  updated = text.slice(0, insertAt) + BLOCK + text.slice(insertAt);
  console.log("• Inserting new freemium section before \"## Planned integrations\".");
}

if (updated === text) {
  console.log("• No changes needed — file already up to date.");
  process.exit(0);
}

copyFileSync(target, `${target}.bak`);
writeFileSync(target, updated.replace(/\n/g, eol), "utf8");

console.log(`✓ Updated ${target}`);
console.log(`✓ Backup written to ${target}.bak`);
