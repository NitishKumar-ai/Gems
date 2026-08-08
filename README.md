# Gems — a Claude Code plugin for your builder journey

A plugin that watches how you build with Claude Code and turns it into a **journey**: what you
shipped, how you steered the agent, how that changed over weeks and months, and a shareable public
profile with achievements you actually earned.

Not a report card. A record of getting better, that you can show people.

## The shape of it

**A plugin, first.** Gems installs into Claude Code and captures each session as it ends. No Docker
image to run, no command to remember, nothing to upload by hand. The data collects itself because it
lives where the work already happens.

**Longitudinal, not a snapshot.** The interesting claim is not "this repo scored 82." It is "six
weeks ago you edited before reading the file; now you read first 90% of the time." Evolution needs a
history, so every session appends to a local store.

**Community at the end, not the start.** Achievements and comparison are the reason to come back, but
they only mean something on top of a real record. Profile first, community second.

## What gets measured

All of it derived from your own session transcripts, none of it self-reported:

| Signal | What it says about you |
|---|---|
| **Model attribution** | Which models you actually reach for, per session, exact IDs |
| **Evidence-Before-Edit** | Do you read and test before you change code, or edit blind |
| **Steering** | How often you stop and redirect the agent instead of letting it run |
| **Invalid Action Rate** | How much of the work was failed tool calls and retries |
| **Session shape** | Length, token cost, how many agents in parallel |
| **Evolution deltas** | All of the above, plotted over time — the actual journey |

Achievements are derived from these, and only from these — "informed 90% of edits across 50 edits,"
"real work on 14 separate days," "evidence-before-edit up 10 points against your own earlier
sessions." Earned from evidence, never granted for showing up.

Deliberately excluded: a "% of code written by AI" number. It is trivially gamed and says nothing
about whether you understood what you shipped.

## Install

```
/plugin marketplace add NitishKumar-ai/Gems
/plugin install gems@gems
```

Then `/gems` in any repository. Publishing to a profile additionally needs a `GEMS_API_KEY` from
`/dashboard`.

## Current state

The plugin is real end to end: it captures each session, derives metrics, evaluates achievements, and
publishes a redacted artifact that the profile page renders. Nothing invented is left on a published
profile — the roast and the replay are both built, both unmounted, and both come back when they have
something real to say.

| Piece | Where | State |
|---|---|---|
| Landing page + import form | [src/app/page.tsx](src/app/page.tsx) | Real UI, Mistral-inspired design system |
| Profile page | [src/app/[username]/[repo]/page.tsx](src/app/[username]/[repo]/page.tsx) | Real — renders published metrics and achievements |
| Live Vibe Replay | [src/components/LiveVibeReplay.tsx](src/components/LiveVibeReplay.tsx) | Real component, **not mounted** — see below |
| Gem Roast | [src/components/GemRoast.tsx](src/components/GemRoast.tsx) | Real component, mock roast, **not mounted** |
| Import endpoint | [src/app/api/import/route.ts](src/app/api/import/route.ts) | Regex on a GitHub URL, nothing more |
| Roast service | [src/services/llm.ts](src/services/llm.ts) | Mock — a `setTimeout` and canned text |
| QStash webhook | [src/app/api/webhook/route.ts](src/app/api/webhook/route.ts) | Wired, signature verification commented out |
| Plugin capture hook | [plugin/hooks/capture-session.mjs](plugin/hooks/capture-session.mjs) | Real, tested — records session pointers |
| Longitudinal store | `~/.gems/sessions.jsonl` | Real, written by the hook. Carries derived metrics per session |
| Extractor / metrics | [plugin/lib/extract.mjs](plugin/lib/extract.mjs) | Real, tested — one transcript to one metrics object |
| Journey / evolution deltas | [plugin/lib/journey.mjs](plugin/lib/journey.mjs) | Real, tested — pooled totals and trend across the store |
| Achievements | [plugin/lib/achievements.mjs](plugin/lib/achievements.mjs) | Real, tested — ten farm-resistant badges, each citing its evidence |
| `/gems` command | [plugin/commands/gems.mjs](plugin/commands/gems.mjs) | Real, tested — works offline, displays CLI summary |
| Persistence / identity | [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx) | Real — Postgres with NextAuth GitHub login, API key and published-journey list |
| Plugin tests | [plugin/](plugin/) | 89 tests, passing |
| E2E tests | [tests/e2e/](tests/e2e/) | 15 tests, passing against a seeded Postgres schema |

**Neither the replay nor the roast is on the profile.** Phase 4 stopped mounting
[LiveVibeReplay](src/components/LiveVibeReplay.tsx) when the page started rendering published
metrics, because the component only has invented commits to show and putting those beside a real
person's numbers is the thing decision 3 below exists to prevent. Phase 6 applied the same rule to
the roast, which had been rendering canned text and an invented model name (`Gem (Claude 3.5 Opus)`)
on every published profile. Both components stay in the tree; both come back when there is real data
behind them. An E2E test asserts the roast has not quietly returned.

Every model name on a published profile is now an exact id taken from a transcript.

## Three decisions, and the evidence for them

### 1. Ingest is the session transcript

Git records the *result* of the work. It cannot tell you the agent read three files and ran the tests
before editing, and it carries no model identity. That only exists while the session is happening.

Claude Code writes a full log to `~/.claude/projects/<slug>/<session-id>.jsonl` — per-turn
`message.model`, ordered `tool_use` events with timestamps, `toolUseResult` outcomes, user prompts,
`message.usage` token counts. Verified against this repo's own 182-event session log, where the
metrics above compute cleanly.

Codex (`~/.codex/sessions/`) and Cursor have equivalents, so the approach generalizes past Claude
Code later.

### 2. Capture happens in a `SessionEnd` hook

Plugins declare hooks in `hooks/hooks.json`. `SessionEnd` fires with `session_id` and `cwd` on stdin,
which is everything needed to locate that session's transcript and process it. Verified against the
installed Vercel plugin, which uses exactly this mechanism.

This is the advantage over asking people to run a CLI: capture is automatic, so the journey is
continuous instead of whenever someone remembers.

### 3. Raw transcripts never leave the machine

Transcripts contain verbatim prompts, full file contents, and command output. The extractor runs
locally and emits only derived counts, model IDs, and timestamps. Publishing sends that derived
artifact and nothing else.

Keep this boundary **stricter than Paxel's**, which transmits prompt excerpts and local file paths. A
Gems profile is public by design; theirs sits behind a login. Public changes the threat model.

## Phases

Each phase names the dependency that makes it buildable. Local-first: no backend until Phase 4.

### Phase 0 — Working mock web flow ✅ done

Import form → route → profile page. Build clean, lint clean, E2E green.

*Repaired along the way:* escaped-backtick parse failures in three files, an unrunnable Playwright
spec (no dependency, no config), `params` not awaited under Next 16, a missing input `id`, stale
post-redesign assertions, and a dead Replay play button at end-of-journey.

### Phase 1 — Plugin skeleton + capture ✅ done

Lives in [plugin/](plugin/) — see [plugin/README.md](plugin/README.md) for the record schema,
failure behavior, and environment overrides.

- [plugin/.claude-plugin/plugin.json](plugin/.claude-plugin/plugin.json) — manifest
- [plugin/hooks/hooks.json](plugin/hooks/hooks.json) — declares the `SessionEnd` hook
- [plugin/hooks/capture-session.mjs](plugin/hooks/capture-session.mjs) — locates the finished
  transcript, appends a pointer record to `~/.gems/sessions.jsonl`
- 12 unit tests, including one asserting no transcript content reaches the store

Verified against this repo's own live session: 1,057,977 bytes, 323 events, located and recorded.
Nothing user-visible yet — this proves the pipe.

*Depends on:* nothing new. Mechanism verified against the installed Vercel plugin.

### Phase 2 — Extractor + journey metrics ✅ done

Captured sessions become the signals above, per session plus evolution deltas across the store.
[plugin/lib/extract.mjs](plugin/lib/extract.mjs) turns one transcript into one metrics object;
[plugin/lib/journey.mjs](plugin/lib/journey.mjs) turns the store into totals and a trend.

Extraction moved into the `SessionEnd` hook rather than running later on demand. Phase 1 stored
pointers to transcripts that Claude Code prunes, and flagged the resulting history loss as its most
serious open issue. Metrics now outlive the transcripts they came from.

*Traps found by running it against real session logs* — each one a confidently wrong number headed
for a public profile:

- **Tokens double.** One assistant message is written as several JSONL lines, each repeating the
  same `usage` object. Summing per record reported 351,282 output tokens for a session that spent
  154,341. Usage is keyed on `message.id`.
- **Failures hide from `is_error`.** A failed Bash call arrives as the string `"Error: Exit code 1"`;
  API trouble appears only as a top-level `error`, `isApiErrorMessage`, or `retryAttempt`. The naive
  reader scored a session with known failures as 100% clean, exactly as predicted.
- **`stderr` is not failure.** The obvious fix for the above — treat non-empty `stderr` as a failed
  command — invents failures. Every non-empty `stderr` in these logs is a benign cwd-reset notice
  from a command that exited 0.
- **MCP tool names can carry an account id.** `mcp__<uuid>__notion-fetch` identifies a connector
  instance, not a way of building. UUID-shaped server segments are stripped; readable ones kept.
- **Ratios must not be averaged across sessions.** A 1-edit miss beside a 100-edit clean run is 99%,
  not 50%. Rates are pooled from raw counts, always.
- **A trend needs history.** Below six extracted sessions there is no trend, only a stated reason.

*Depends on:* Phase 1's store.

### Phase 3 — `/gems` command ✅ done

See your own journey in the terminal. Works fully offline, zero backend, and is the first point where
the plugin is worth installing — so it is also where the plugin finally gets a marketplace entry.

*Fixed from Phase 2:* Trends split the store by calendar time rather than array halves, and `Grep` is properly treated as evidence before editing.

*Depends on:* Phase 2.

### Phase 4 — Publish a shareable profile ✅ done

Redacted profile artifact → a public link. This is where the existing Next.js app earns its keep, and
where identity and persistence finally become unavoidable.

*Fixed from Phase 3:* Added NextAuth (GitHub) and a Prisma SQLite database to store user identity and API keys. The `/gems publish` CLI command now pushes local metrics securely to the backend, rendering them live on the builder's profile.

*Depends on:* Phase 3, and a decision on identity + store.

### Phase 5 — Achievements ✅ done

Ten badges derived from the longitudinal store, in [plugin/lib/achievements.mjs](plugin/lib/achievements.mjs),
each naming the numbers that earned it. They ride along on the journey artifact, so `/gems`,
`/gems publish`, and the profile page all read the same evaluation.

The design constraint was to assume people will farm them. Three things came out of taking that
seriously:

- **The gate matters more than the catalog.** Without one, "ten sessions with zero failed tool
  calls" is farmed by opening and closing Claude Code ten times — each empty session has no tool
  calls, so its failure rate is a perfect 0% and nothing contradicts it. A session counts only with
  5+ tool calls and 3+ assistant turns; the rest are reported as `ignored_sessions` rather than
  quietly dropped.
- **Ratios need a floor under the denominator.** Informing one edit out of one is 100% and is
  evidence of nothing, so every rate rule carries a minimum volume that has to hold at the same time.
- **Consistency is counted in calendar days, never sessions.** Fourteen sessions fit in an afternoon.
  Days and weeks bucket in UTC, so a profile does not change when its owner changes timezone.

Rules are checked against every prefix of history, so the first prefix where one holds is when it was
earned, and it stays earned. Testing the trailing window instead would make badges blink out on a bad
week, which turns a record into a live readout. `getting-better` is the one deliberate exception: it
is a present-tense claim about direction of travel, so it is allowed to lapse and is marked
`revocable` rather than leaving anyone to infer it.

Badges cite the *ordinal* of the session that crossed the line — "your 12th session" — never the
session id, because those are Claude Code UUIDs and this artifact is built to be published. A test
asserts none reach the output.

*Found while building it:* a bare majority is not a habit. `hands-on` originally fired above 50%, but
since rules are tested against every prefix, a genuinely coin-flip habit still crosses half on
odd-length prefixes — 11 of 21 is a majority. The bar is 60%, and the gap above half is what makes
the claim mean anything.

*Depends on:* Phase 4, so they are shareable.

### Phase 6 — Publishing for real ✅ done

Phase 5 shipped achievements onto a profile nobody else could reach. Four things stood between the
repo and a second user, and Community depended on all of them:

- **Anyone could publish as anyone.** `/api/publish` took `username` from the request body. The
  ownership check added in Phase 5 only compared against profiles that *already existed*, so a
  handle nobody had claimed passed every test and was created on the spot — any signed-in account
  could take `/torvalds/linux`. The handle now comes from the GitHub login bound to the API key at
  sign-in and nothing else; the body value is accepted only to be checked. A regression test
  publishes as `torvalds` and asserts a 403, and it returns 200 against the old route.
- **The plugin could not be installed.** There was no marketplace entry, and `/gems` was declared in
  a `commands/commands.json` that is not part of the plugin format — installed, Claude Code
  reported `Skills (0)` and the command did not exist. It had only ever worked because the script
  was run by hand. See [plugin/README.md](plugin/README.md#the-command-has-to-be-markdown).
- **Nothing was deployed**, and the database was SQLite with no migration history. Now Postgres,
  with `prisma/migrations/` as the source of truth and an E2E suite that applies the same
  migrations production will.
- **The roast was still mock data on a public profile**, which is the exact thing the replay was
  pulled for. Unmounted, with a test asserting it stays that way.

Also closed here: the missing CI pipeline, and a dashboard that listed published journeys as "these
will appear here soon."

*Depends on:* Phase 5, and a deploy target.

### Phase 7 — Community

Compare, browse, follow. The retention layer, and the only phase that genuinely needs a backend with
accounts.

*Depends on:* Phase 6 — profiles that other people can actually publish, under handles that are
provably theirs. Comparison across profiles anyone could have written is not comparison.

**The roast** ([GemRoast.tsx](src/components/GemRoast.tsx)) folds in as flavor on the profile once
there is real data to roast — not its own phase. It is also the most directly duplicated feature; see
below.

## Prior art — what actually exists

Verified, not assumed:

**[Paxel](https://paxel.ycombinator.com/)** — a YC service reading Claude, Codex, and Cursor
transcripts to produce behavioral reports. **2.8M+ sessions analyzed.** Local Docker client; raw
conversation history, full prompts, agent responses, and tool outputs stay on the machine, while
per-session narratives, prompt excerpts, file paths, steering traces, and derived scores upload. YC
SSO auth; the resulting token attaches to a Startup School 2026 application. Its archetypes
(Architect, Night Owl) and "biggest crash out" surface are close cousins of the roast.

**[gstack](https://github.com/garrytan/gstack)** — Garry Tan's MIT-licensed Claude Code skill suite
plus a headless browser. Twenty-three slash-command specialists. Local developer tooling, not a
platform, and it contains **zero** references to Paxel.

**[gbrain](https://github.com/garrytan/gbrain)** — persistent knowledge base giving agents semantic
code search and cross-session memory.

### Where Gems sits

Paxel validates the two hardest calls here: transcripts are the right source, and redaction belongs
on the client. At millions of sessions, that is no longer a bet.

It also means "analyze my transcripts and tell me about myself" is taken, by a competitor with YC
distribution and an admissions incentive. The differences that matter:

| | Paxel | Gems |
|---|---|---|
| Form | Docker client + web reports | Claude Code plugin |
| Capture | You run a command | `SessionEnd` hook, automatic |
| Cadence | Periodic snapshots | Continuous |
| Output | Private report + YC token | Public shareable profile |
| Time axis | This upload | Evolution across weeks |
| Social | Compare against aggregate | Community, achievements, follow |
| Transmits | Prompt excerpts, file paths | Derived counts only |

The wedge is **form and continuity**, not analysis. A plugin that lives in the loop and quietly
compounds a public journey is a different product from a tool you occasionally point at a folder.

## Out of scope

A deep-research report circulated with this project (`deep-research-report.md`, kept outside the
repo) describes a large public learning platform — executable task packs, sandboxed execution, hint ladders, a learner
skill graph, peer-review queues, a federated registry — and attributes it to a "GStack / GBrain /
GStack-Paxcel" hierarchy.

**That hierarchy is not real.** gstack is a local skill suite, not a platform with task discovery and
employer access. gbrain is agent memory, not a learner evidence graph. "Paxcel" is not an open
portable specification — it is a closed YC service spelled *Paxel*, and `paxcel.ycombinator.com` does
not resolve. Use the document for ideas, not as a description of anything that exists.

Its platform design is out of scope on its own terms too: it assumes the platform *hosts* the coding
session, and budgets a multi-year, multi-person build. Gems observes work done elsewhere.

Also excluded: the report's composite "Guessing Reduction Index" (arbitrary weights, and collapsing
these signals into one score invites the reductive-filter misuse the report itself warns about), and
its metrics that need a task-and-hint concept Gems has no way to observe — calibration error,
hint-dependence curves, transfer retention, run disagreement.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS 3 · TypeScript · Prisma + Postgres ·
NextAuth · Playwright

> **Note:** this Next.js version has breaking changes from older conventions. Read the relevant guide
> in `node_modules/next/dist/docs/` before writing App Router code — see [AGENTS.md](AGENTS.md).

## Getting started

```bash
bun install
```

Create the database. Copy [.env.example](.env.example) to `.env` and point `DATABASE_URL` at a
Postgres server first:

```bash
createdb gems_dev && npx prisma migrate dev
```

`prisma/migrations/` is the source of truth — `db push` would apply the schema while skipping the
history, which is the thing that stops mattering right up until there is a deployed database.

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste any GitHub URL — the flow runs on mock
data.

Run the plugin unit tests:

```bash
bun run test:plugin
```

Run the E2E tests. They start their own dev server and seed an isolated Postgres *schema* derived
from your `DATABASE_URL` in [tests/e2e/global-setup.ts](tests/e2e/global-setup.ts), so they never
touch your own rows:

```bash
bun run test:e2e
```

Type-check and build:

```bash
bun run build
```
