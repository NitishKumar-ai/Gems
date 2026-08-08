# TODOS

Organized by component, then priority (P0 highest through P4), with completed work at the bottom.

## Profile page

### Restore the Live Vibe Replay, or delete it

**Priority:** P2

Phase 4 stopped mounting [LiveVibeReplay](src/components/LiveVibeReplay.tsx) on the profile and
Phase 5 left it that way, because the component only has invented commits to offer and the page now
renders a real person's published metrics. The component is still in the tree and still tested at
the unit level by nothing at all.

Two things have to happen together:

- Decide whether the replay comes back with real commit data (derivable from the session store —
  the extractor already records tool calls per session) or gets deleted outright.
- If it comes back, restore the ISSUE-001 regression guard retired in this branch. That guard
  asserted every diff line occupies its own row and the viewer does not scroll sideways. The bug it
  caught: `w-full inline-block` spans laid out side by side, putting a 4-line diff on one row at 4x
  the viewer width. Use `block`, not `inline-block`.

Until then the replay is dead code that reads as a shipped feature.



## Plugin

### ~~Achievements only read Claude Code sessions~~
**Priority:** P3
[achievements.mjs](plugin/lib/achievements.mjs) evaluates the store the capture hook writes, and that hook only understands `~/.claude/projects/`. Codex (`~/.codex/sessions/`) and Cursor have equivalent transcripts. Nothing in the achievement rules is Claude-specific, so this is a capture problem rather than an evaluation one. *Implemented capture from Codex and Cursor transcripts.*

### Rubric bands need real-data calibration

**Priority:** P2

The rubric feature (see the office-hours design doc,
`Nitish-main-design-20260808-094411.md`) ships its default band thresholds as explicitly
"provisional" — they come from an LLM cold-read during the design session, not from any real
distribution of builder journeys. Replace them once enough published profiles exist to calibrate
against. The shared test fixtures written for the boundary-value tests (plan-eng-review Issue 8)
double as the starting dataset. Depends on enough real, varied journeys existing — not currently
blocking, since the "provisional" UI marker is the accepted interim state.

### ~~Duplicated rubric interpolation logic (plugin + app)~~
**Priority:** P2
**Completed:** v0.8.0 (2026-08-08)

`plugin/lib/rubric.mjs` and `src/lib/rubric.ts` each implement the same band-interpolation
function independently (plan-eng-review Issue 7b), guarded only by a cross-reference comment and
shared test fixtures — not a single source of truth. *Consolidated into a shared package at the root `shared/rubric-bands.mjs` and `shared/rubric-bands.d.mts`, which both the plugin and the app import.*

## Completed

### ~~Give the roast something real to say~~

**Priority:** P3
**Completed:** v0.9.0 (2026-08-08)

The placeholder `GemRoast` component was replaced by a real, Anthropic-powered `BuilderReveal` component. The `analyzeJourney` function now calls `claude-opus-5` during publish, strictly filtering the metrics to avoid exposing raw session data, and the result is cached in the new `Journey.analysis` column in Postgres.


### ~~Not actually deployed~~

**Priority:** P1
**Completed:** v0.8.0 (2026-08-08)

Live at [gems.inmodel.in](https://gems.inmodel.in) — Vercel (project `gems`) + Neon Postgres via
the Vercel Marketplace integration, a production GitHub OAuth app, `AUTH_SECRET`/`AUTH_GITHUB_ID`/
`AUTH_GITHUB_SECRET` set as production env vars, `prisma migrate deploy` applied against the live
database, and [gems.mjs](plugin/commands/gems.mjs)'s `GEMS_HOST` default pointed at the deployed
origin. A real GitHub login was verified end-to-end against production: `User`, `Account`, and
`Session` rows landed correctly, and the `githubLogin` backfill ran as expected.

### Locked-state progress bars have no ARIA progress attributes

**Priority:** P3
**Completed:** v0.8.0 (2026-08-08)

Both `LockedBadge` (`src/components/Achievements.tsx`) and the rubric's `LockedCard`
(`src/components/RubricCard.tsx`) render their progress bar with
`role="progressbar"` and `aria-valuenow`/`aria-valuemin`/`aria-valuemax` now, fixed
together in one change as planned rather than making one more accessible than the
other.

### Anyone could publish under anyone's handle

**Priority:** P0
**Completed:** v0.7.0 (2026-08-08)

`/api/publish` took `username` from the request body. Phase 5's ownership check only compared
against profiles that already existed, so a handle nobody had claimed passed every check and was
created on the spot — any signed-in account could take `/torvalds/linux`. The handle now comes from
the GitHub login bound to the API key at sign-in. Recorded here late: this was flagged in the
route's own comment as P0 and never made it into this file.

### The plugin could not be installed

**Priority:** P1
**Completed:** v0.7.0 (2026-08-08)

No marketplace entry, and `/gems` was declared in a `commands/commands.json` that is not part of the
plugin format — `claude plugin details gems` reported `Skills (0)` on an installed copy. Now
[.claude-plugin/marketplace.json](.claude-plugin/marketplace.json) and
[plugin/commands/gems.md](plugin/commands/gems.md).

### No CI pipeline

**Priority:** P2
**Completed:** v0.7.0 (2026-08-08)

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs lint, plugin typecheck, plugin tests,
build and E2E against a Postgres service container on every pull request.

### No Prisma migrations

**Priority:** P3
**Completed:** v0.7.0 (2026-08-08)

Closed alongside the move to Postgres: `prisma/migrations/` is now the source of truth, and the E2E
suite applies it with `migrate deploy` rather than `db push` so a broken migration fails in CI.

### Achievements derived from the longitudinal store

**Priority:** P1
**Completed:** v0.6.0 (2026-08-08)

Ten badges in [achievements.mjs](plugin/lib/achievements.mjs), farm-resistant by a qualifying-session
gate, denominator floors on every rate, and calendar-day consistency windows. Earned on a forward
walk of history so badges never blink out.

### Repair the E2E suite

**Priority:** P0
**Completed:** v0.6.0 (2026-08-08)

Red since Phase 4 made the profile page read from the database while the spec still drove the mock
import flow. Now seeded from [global-setup.ts](tests/e2e/global-setup.ts) into an isolated database.

### Pin down DATABASE_URL

**Priority:** P1
**Completed:** v0.6.0 (2026-08-08)

Prisma resolves `file:./dev.db` against `prisma/schema.prisma`, so the app read `prisma/dev.db`
while git tracked an unused `dev.db` at the repo root. The stray file is untracked and
[.env.example](.env.example) documents the real setting.
