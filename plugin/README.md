# Gems plugin

Captures your Claude Code sessions so Gems can build a builder journey out of them.

**Phase 1 scope: capture only.** This does nothing user-visible yet. It records *that* a session
happened and where its transcript lives. Reading anything out of that transcript is Phase 2, and
publishing anything is Phase 4.

## What it does

A `SessionEnd` hook fires when a session ends. Claude Code pipes a JSON payload on stdin carrying
`session_id` and `cwd`. The hook locates that session's transcript and appends one line to
`~/.gems/sessions.jsonl`:

```json
{
  "schema": 1,
  "source": "claude-code",
  "session_id": "5f635de0-5141-4f36-a59f-b1331315bafb",
  "cwd": "/Volumes/NIT-SSD/Development/Gems",
  "project_slug": "-Volumes-NIT-SSD-Development-Gems",
  "transcript_path": "/Users/you/.claude/projects/-Volumes-.../5f635de0-....jsonl",
  "captured_at": "2026-08-07T15:48:08.446Z",
  "bytes": 1057977,
  "lines": 323
}
```

That is the whole record. **No transcript content is read or stored** — not prompts, not file
contents, not command output. A test asserts this directly: a transcript containing a fake secret
produces a store that does not contain it.

Nothing is transmitted anywhere. There is no network code in this plugin.

`bytes` and `lines` come from a **single** pass over the file. Reading the size separately from the
content lets the two disagree when a transcript grows mid-capture, which would publish two numbers
describing different versions of the same session.

Transcripts over 32 MB are recorded from `stat` alone, with `lines: null`. The hook has a 10s
timeout, and an external kill skips this script's own error handling — a record without a line count
beats no record at all.

## Permissions

`~/.gems/` is created `0700` and its files `0600`. The store names repositories, working
directories, transcript paths, session ids, and activity times; under a default umask on a shared
machine, other local accounts could otherwise read all of it.

## Finding the transcript

Claude Code names project directories after the absolute path with separators and dots flattened, so
`/Volumes/NIT-SSD/Development/Gems` becomes `-Volumes-NIT-SSD-Development-Gems`.

The hook tries that derived slug first, then **falls back to scanning every project directory** for
`<session_id>.jsonl`. The naming rule belongs to Claude Code and could change; session ids are unique
on their own, so the scan is the durable path and the slug is just a shortcut.

## Failure behavior

A hook that throws disrupts a real session, so every failure path writes a line to
`~/.gems/capture.log` and exits 0. Verified against empty stdin, malformed JSON, path-traversal
session ids, missing transcripts, and unreadable files.

Session ids are validated against `^[a-zA-Z0-9_-]+$` before touching the filesystem, so a payload
like `{"session_id": "../../../etc/passwd"}` is rejected rather than resolved.

## Duplicates and resumed sessions

`SessionEnd` can fire more than once for a session that gets resumed. Records are deduplicated on
`(session_id, bytes)`: re-ending an unchanged session is skipped, while a resumed session that ended
larger appends a new record.

**Phase 2 should read the last record per `session_id`,** not every record.

The dedupe check reads only the last 64 KB of the store. This hook runs on every session end and the
store only grows, so scanning the whole file would make each capture slower than the last. Duplicate
`SessionEnd` events arrive seconds apart, so the tail is where they always are. The accepted
tradeoff: a duplicate older than 64 KB of history would be appended again, which is harmless because
Phase 2 takes the last record per session.

Concurrent captures from two sessions ending at once are not locked. POSIX append writes of this size
do not interleave, so the store stays parseable; the worst case is a redundant record.

## Environment overrides

| Variable | Purpose |
|---|---|
| `GEMS_HOME` | Where the store and log live. Default `~/.gems` |
| `GEMS_CLAUDE_PROJECTS` | Transcript root. Default `$CLAUDE_CONFIG_DIR/projects` or `~/.claude/projects` |
| `CLAUDE_CONFIG_DIR` | Respected when `GEMS_CLAUDE_PROJECTS` is unset |

Both overrides exist so the tests can run against a temp directory, and they double as the escape
hatch for non-default Claude Code installs.

## Tests

```bash
bun run test:plugin
```

Scoped to `plugin/` on purpose — an unscoped `bun test` would also collect the Playwright spec in
`tests/e2e/`, which needs a browser and a dev server.

## Trying the hook by hand

```bash
echo '{"session_id":"<a-real-session-id>","cwd":"'"$PWD"'"}' | GEMS_HOME=/tmp/gems-probe node plugin/hooks/capture-session.mjs && cat /tmp/gems-probe/sessions.jsonl
```

Find a real session id with `ls ~/.claude/projects/`.

## Not done yet

- Not installed as a plugin anywhere — no marketplace entry, so the hook only runs when invoked by
  hand. Wiring it into a live Claude Code install is deliberately deferred until Phase 2 gives the
  captured data a purpose.
- Only reads Claude Code. Codex (`~/.codex/sessions/`) and Cursor come later.
- **The store points at transcripts rather than snapshotting them, so history is not actually
  durable yet.** Claude Code owns that directory; if a transcript is removed before Phase 2 extracts
  from it, the session's detail is gone for good. For a product whose whole claim is an accumulating
  journey, that is the most serious open issue in Phase 1 — Phase 2 should extract eagerly at capture
  time rather than inherit this risk.
- Assumes `node` is on `PATH`. The plugin neither bundles a runtime nor checks for one, so if `node`
  is missing the shell fails before the script runs and no diagnostic is written. This matches how
  the first-party Vercel plugin invokes its own hooks.
