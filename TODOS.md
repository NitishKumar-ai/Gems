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

### The roast is still mock data on a public profile

**Priority:** P2

[GemRoast](src/components/GemRoast.tsx) renders canned text and an invented model name
(`Gem (Claude 3.5 Opus)`) on the published profile, hardcoded in
[the page](src/app/[username]/[repo]/page.tsx). The replay was pulled for exactly this reason, so
leaving the roast is inconsistent. Either wire it to [the roast service](src/services/llm.ts) with
real metrics, or drop it from the profile until it has something real to say.

## Plugin

### Achievements only read Claude Code sessions

**Priority:** P3

[achievements.mjs](plugin/lib/achievements.mjs) evaluates the store the capture hook writes, and
that hook only understands `~/.claude/projects/`. Codex (`~/.codex/sessions/`) and Cursor have
equivalent transcripts. Nothing in the achievement rules is Claude-specific, so this is a capture
problem rather than an evaluation one.

## Infrastructure

### No CI pipeline

**Priority:** P2

There is no `.github/workflows/`, so nothing runs `bun run test:plugin`, `bun run test:e2e`,
`bun run build`, or `bun run lint` on a pull request. All four pass locally as of this branch; the
next regression lands unnoticed.

### No Prisma migrations

**Priority:** P3

`prisma/` has a schema but no `migrations/` directory, so the only way to build the database is
`npx prisma db push`. That works for local development and loses schema history the moment there is
a deployed database to evolve.

## Completed

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
