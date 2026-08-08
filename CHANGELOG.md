# Changelog

All notable changes to Gems are recorded here. This project follows
[Semantic Versioning](https://semver.org/) using the version in `package.json`.

## [0.9.0] - 2026-08-08

### Added

- **Anthropic-powered Builder Report.** Replaced the placeholder "Gem's Roast" with a Spotify Wrapped-style animated reveal powered by the Anthropic SDK (`claude-opus-5`). The report summarizes your builder archetype, highlights your best rubric dimension, and offers a concrete growth edge based on real session data.
- **Analysis Storage.** The database schema now includes an `analysis` column on the `Journey` model to store AI-generated reports, preventing redundant LLM calls on page views.

### Changed

- **Strict Data Projection.** `analyzeJourney` now strictly filters the `metrics` object to an `AnalysisInput` shape before sending it to the model. This guarantees that raw session content (like `replay_events`) is never sent to the LLM, and the model only sees aggregate counts, rates, and evidence strings.
- **Resilient Publish Workflow.** The LLM analysis step in `/api/publish` is best-effort. If the `ANTHROPIC_API_KEY` is missing, or the model call fails, the journey is still published successfully without the analysis component.

### Removed

- **Unauthenticated Webhook.** Removed the `/api/webhook` QStash route which was an unauthenticated placeholder for the now-implemented LLM processing.

## [0.8.0] - 2026-08-08

### Added

- **The Builder Rubric.** Four scored dimensions below Achievements on every profile — Evidence
  Discipline, Prompt Craft, Execution Hygiene, Learning Velocity — each backed by the real
  session data that produced it, with an inline evidence line plus a click-to-expand trail
  rather than an opaque number. Scores interpolate live against the current threshold bands
  (shown as "Bands as of {date}", with a provisional indicator until real-data calibration
  lands) rather than being frozen at publish time, so recalibrating later changes what an
  already-published profile shows without anyone republishing.
- **Deployable, for real.** `prisma generate` now runs automatically via `postinstall`, so a
  fresh Vercel build actually has a Prisma Client to import. README documents the Vercel + Neon
  setup end to end.

## [0.7.0] - 2026-08-08

### Fixed

- **Anyone with an account could publish under anyone's handle.** `/api/publish` took the username
  from the request body, and the ownership check added in the last release only compared against
  profiles that already existed — so a handle nobody had claimed passed every check and was created
  on the spot. Any signed-in account could take `/torvalds/linux`. Your profile handle now comes
  from the GitHub login recorded when you sign in, and nothing else. A username in the request is
  still read, but only to be checked and refused.
- **The plugin could not actually be installed.** There was no marketplace entry, and `/gems` was
  declared in a file that is not part of the plugin format — installed, Claude Code found no
  commands at all. It had only ever worked because the script was being run by hand during
  development. `/plugin marketplace add NitishKumar-ai/Gems` then `/plugin install gems@gems` now
  installs a working plugin, hook and command both.

### Added

- **A CI pipeline.** Lint, plugin typecheck, plugin tests, build and the end-to-end suite now run
  on every pull request, against a real Postgres.
- **The dashboard lists what you have published**, each entry linking to its profile. It previously
  said "These will appear here soon."

### Changed

- **Postgres, with migrations.** The database moved from SQLite to Postgres and
  `prisma/migrations/` is now the source of truth. The end-to-end suite applies those same
  migrations into a schema of its own, so a broken or missing migration fails in CI rather than on
  a deploy. Local setup is `createdb gems_dev && npx prisma migrate dev`.
- **`/gems publish` no longer asks for your username.** The server knows who you are from your API
  key. `--username` and `GEMS_USERNAME` are still accepted, and now produce a clear error naming
  the handle you actually own instead of publishing somewhere unexpected.

### Removed

- **The roast is no longer on the profile.** It had been rendering canned text and an invented
  model name (`Gem (Claude 3.5 Opus)`) beside real published numbers — the same reason the replay
  was pulled two releases ago. The component stays in the project and comes back when there is a
  real model behind it. A test now asserts it has not crept back.

## [0.6.0] - 2026-08-08

### Added

- **Achievements you actually earned.** Ten badges derived from your own session history, each one
  naming the numbers behind it — "informed 57 of 60 edits (95.0%)", not just a trophy. They show up
  in `/gems`, travel with `/gems publish`, and render on your public profile. Badges you have not
  earned yet show how close you are, and say which condition is still the blocker.
- **Badges are built to resist farming.** A session only counts toward one if it contains real work
  (5 or more tool calls, 3 or more assistant turns), so opening and closing Claude Code in a loop
  earns nothing. Every rate carries a minimum volume, because informing one edit out of one proves
  nothing. Streaks count calendar days in UTC, so fourteen sessions in an afternoon is not a
  fortnight and flying somewhere does not change your profile.
- **Badges are a record, not a live readout.** Each rule is tested against every point in your
  history, so the first moment you met it is when you earned it, and it stays earned through a bad
  week. The one exception is "Getting Better", which is a claim about your current direction of
  travel and says on the profile that it can lapse.
- **Evolution now shows the volume behind the change.** A trend reports the edit counts in each half
  of your history, so a swing of twelve points can be read as the real move or the small sample it
  might be.

### Fixed

- **Anyone with an API key could take over your public profile.** `/api/publish` trusted the
  username in the request body without checking it against the key that sent it, so a valid key
  could overwrite any profile and reassign ownership in the same call. Publishing now refuses to
  touch a profile another account owns. An empty bearer token is also rejected before it reaches
  the database.
- **A partially filled profile took the whole page down.** Any published journey missing a rate or a
  trend delta crashed the profile with a server error instead of showing "N/A". Missing numbers are
  now missing rows.
- **The end-to-end tests work again.** They had been failing since the profile page started reading
  from the database while the tests still went through the mock import form, which never creates a
  profile. Tests now seed their own isolated database and never touch your local one.
- **`DATABASE_URL` pointed somewhere surprising.** Prisma reads it relative to the schema file, so
  `file:./dev.db` meant `prisma/dev.db` while an unused copy sat in the project root. The stray
  copy is gone and `.env.example` documents the real setting.

### Removed

- **The Live Vibe Replay is no longer on the profile.** It only had invented commits to show, and
  the page now displays a real person's published numbers. The component is still in the project and
  comes back when there is real commit data behind it.

## [0.5.0] - 2026-08-08

### Added

- **Identity & Persistence (Phase 4).** Added an SQLite database (via Prisma) and NextAuth (GitHub) to authenticate users on the web dashboard.
- **Publishing Journeys.** The `/gems` CLI command now accepts a `--publish` flag (or `publish` argument) which pushes the local metrics to the Next.js backend using a generated API key.
- **Dynamic Profile Pages.** The `/[username]/[repo]` pages now fetch and render real metrics from the database instead of showing hardcoded mocks.

## [0.4.0] - 2026-08-08

### Added

- **`/gems` terminal command.** See your own journey in the terminal, completely offline. The plugin is now ready for use and includes a `commands.json` registration for Claude Code.

### Changed

- **Calendar time trends.** Evolution deltas now split your sessions at the calendar midpoint between the first and last session, rather than simply splitting the number of sessions in half. This provides an accurate "before vs now" view even if session frequency varies.
- **`Grep` as evidence.** Using the `Grep` tool now counts as global evidence for the session. Edits following a grep are correctly scored as informed, fixing a bug where they were counted as blind edits.

## [0.3.0] - 2026-08-08

### Added

- **Sessions now become numbers.** The plugin derives metrics from each session as it ends: which
  models you actually used, whether you read a file before editing it, how often you steered the
  agent, how much of the work was failed tool calls, how long the session ran, and what it cost in
  tokens. Verified against real session logs, not against a spec.
- **A journey across sessions,** with totals and the direction of travel — whether a habit is
  improving or slipping, compared between the earlier and more recent halves of your history.
- 35 more tests, covering each wrong number the extractor was built to avoid.

### Changed

- **Extraction now happens the moment a session ends,** rather than later on demand. The previous
  release only stored a pointer to each transcript, and Claude Code deletes those — a journey built
  on pointers quietly loses its own history. Metrics now outlive the transcripts they came from.
  This was the most serious open issue in the last release.
- Store records carry a `metrics` object and move to schema 2. Older records remain readable and are
  reported as thin history rather than as sessions that scored zero.

### Fixed

Four ways the numbers came out confidently wrong, each found by running the extractor over real
session logs:

- **Token counts were more than double the truth.** One reply from the agent is written to the log
  as several lines, each repeating the same usage figures. Counting them separately reported 351,282
  output tokens for a session that actually spent 154,341.
- **Failed work was being scored as clean.** A failed command and a dropped connection are both
  recorded in ways that the obvious check misses entirely, so a session with known failures came out
  at 100% clean.
- **The obvious fix for that invented failures instead.** Treating anything written to the error
  stream as a failure flags ordinary commands that succeeded — every such case in these logs was a
  harmless notice.
- **Tool names could carry an account identifier.** Connections to outside services are named with an
  id belonging to your account, which said nothing about how you build and would have been published.
  It is now removed, while the readable names that are worth showing are kept.

Two more, about what the numbers claim:

- **A rate is no longer averaged across sessions.** One careless edit in a small session, beside a
  hundred careful edits in a large one, is 99% careful — not 50%.
- **A trend is no longer reported from too little history.** Below six sessions there is no trend,
  and the reason is stated rather than a number being shown.

## [0.2.0] - 2026-08-07

### Added

- **Gems plugin — automatic session capture.** A Claude Code plugin that records each coding session
  as it ends, so a builder journey collects itself instead of needing a command run by hand. Records
  land in `~/.gems/sessions.jsonl`, owner-readable only.
- Journey records carry the session id, working directory, transcript location, capture time, and the
  size and event count of the session. No prompts, file contents, or command output are ever read or
  stored, and nothing is transmitted anywhere.
- The replay on a portfolio page can be replayed. Pressing play after a journey finishes now restarts
  it from the first commit instead of doing nothing.
- Test coverage for the whole capture path — 18 unit tests plus an end-to-end test of the replay
  controls — and a `test:plugin` script to run them.

### Changed

- The project README now documents what Gems is, what it measures, the evidence behind the ingest and
  privacy decisions, and a phase plan with the dependency that makes each phase buildable.
- Portfolio pages read their route parameters the way current Next.js requires, so the repository and
  username shown are the ones in the URL.

### Fixed

- **The build was broken and now works.** Template literals in three files had been written with
  shell-style escaping, which made them unparseable.
- **The webhook no longer accepts unauthenticated work.** It refused nothing before; it now returns
  503 until a signing key is configured, closing a route that let any caller fan out background jobs.
- **Installs no longer require an Apple Silicon Mac.** A platform-locked binary had been listed as a
  required dependency, which could fail a clean install on Linux, Windows, or Intel before the build
  started.
- Dependency downloads resolve from the public npm registry again, rather than the third-party mirror
  that had been written into the lockfile.
- The end-to-end test suite can actually run — it had no test runner installed and no configuration.
- Session capture reads each transcript once, so its reported size and event count always describe the
  same version of a session, and very large transcripts are recorded rather than risking a timeout.
- A directory named like a transcript is no longer mistaken for one.
