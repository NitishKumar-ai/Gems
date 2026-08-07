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

Achievements are derived from these, and only from these. "First session with zero failed tool
calls," "ten sessions running tests before editing," "shipped on a Tuesday for four weeks straight."
Earned from evidence, never granted for showing up.

Deliberately excluded: a "% of code written by AI" number. It is trivially gamed and says nothing
about whether you understood what you shipped.

## Current state

The web surface exists as a working mock. The plugin is real: it captures each session and derives
metrics from it. Nothing is published yet — the profile page still renders from a hardcoded mock.

| Piece | Where | State |
|---|---|---|
| Landing page + import form | [src/app/page.tsx](src/app/page.tsx) | Real UI, Mistral-inspired design system |
| Profile page | [src/app/[username]/[repo]/page.tsx](src/app/[username]/[repo]/page.tsx) | Renders from a hardcoded mock |
| Live Vibe Replay | [src/components/LiveVibeReplay.tsx](src/components/LiveVibeReplay.tsx) | Real component, mock commits |
| Gem Roast | [src/components/GemRoast.tsx](src/components/GemRoast.tsx) | Real component, mock roast |
| Import endpoint | [src/app/api/import/route.ts](src/app/api/import/route.ts) | Regex on a GitHub URL, nothing more |
| Roast service | [src/services/llm.ts](src/services/llm.ts) | Mock — a `setTimeout` and canned text |
| QStash webhook | [src/app/api/webhook/route.ts](src/app/api/webhook/route.ts) | Wired, signature verification commented out |
| Plugin capture hook | [plugin/hooks/capture-session.mjs](plugin/hooks/capture-session.mjs) | Real, tested — records session pointers |
| Longitudinal store | `~/.gems/sessions.jsonl` | Real, written by the hook. Carries derived metrics per session |
| Extractor / metrics | [plugin/lib/extract.mjs](plugin/lib/extract.mjs) | Real, tested — one transcript to one metrics object |
| Journey / evolution deltas | [plugin/lib/journey.mjs](plugin/lib/journey.mjs) | Real, tested — pooled totals and trend across the store |
| `/gems` command | [plugin/commands/gems.mjs](plugin/commands/gems.mjs) | Real, tested — works offline, displays CLI summary |
| Persistence / identity | [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx) | Real — SQLite database with NextAuth GitHub login |
| Plugin tests | [plugin/](plugin/) | 53 tests, passing |
| E2E test | [tests/e2e/portfolio.spec.ts](tests/e2e/portfolio.spec.ts) | 1 test, passing |

The model names in the mocks are invented strings, not attribution. The extractor now produces the
real thing; wiring it into the page is Phase 4.

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

### Phase 5 — Achievements

Derived from the longitudinal store, each one traceable to the sessions that earned it.

Design constraint: assume people will try to farm them. An achievement that rewards volume gets
farmed; one that rewards a ratio holding over time is much harder to fake.

*Depends on:* Phase 4, so they are shareable.

### Phase 6 — Community

Compare, browse, follow. The retention layer, and the only phase that genuinely needs a backend with
accounts.

*Depends on:* enough published profiles to make comparison mean anything.

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

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS 3 · TypeScript · Playwright

> **Note:** this Next.js version has breaking changes from older conventions. Read the relevant guide
> in `node_modules/next/dist/docs/` before writing App Router code — see [AGENTS.md](AGENTS.md).

## Getting started

```bash
bun install
```

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste any GitHub URL — the flow runs on mock
data.

Run the plugin unit tests:

```bash
bun run test:plugin
```

Run the E2E test (starts its own dev server):

```bash
bun run test:e2e
```

Type-check and build:

```bash
bun run build
```
