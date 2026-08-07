# Changelog

All notable changes to Gems are recorded here. This project follows
[Semantic Versioning](https://semver.org/) using the version in `package.json`.

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
