# Changelog

All notable changes to Gems are recorded here. This project follows
[Semantic Versioning](https://semver.org/) using the version in `package.json`.

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
