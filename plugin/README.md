# Gems plugin

Captures your Claude Code sessions and turns each one into metrics, so Gems can build a builder
journey out of them.

**Scope: capture, extract, and terminal journey.** A `/gems` command to read your own journey in the terminal is
provided. Publishing anything is Phase 4. Nothing here is transmitted anywhere — there is no network
code in this plugin.

## What it does

A `SessionEnd` hook fires when a session ends. Claude Code pipes a JSON payload on stdin carrying
`session_id` and `cwd`. The hook locates that session's transcript, derives metrics from it, and
appends one line to `~/.gems/sessions.jsonl`:

```json
{
  "schema": 2,
  "source": "claude-code",
  "session_id": "5f635de0-5141-4f36-a59f-b1331315bafb",
  "cwd": "/Volumes/NIT-SSD/Development/Gems",
  "project_slug": "-Volumes-NIT-SSD-Development-Gems",
  "transcript_path": "/Users/you/.claude/projects/-Volumes-.../5f635de0-....jsonl",
  "captured_at": "2026-08-07T15:48:08.446Z",
  "bytes": 4411167,
  "lines": 843,
  "metrics": {
    "schema": 1,
    "started_at": "2026-08-07T14:53:07.652Z",
    "ended_at": "2026-08-07T17:37:18.730Z",
    "duration_ms": 9851078,
    "models": { "claude-opus-5": 210 },
    "turns": { "assistant": 210, "synthetic": 1, "prompts": 11, "commands": 3, "records": 843 },
    "tokens": { "input": 393, "output": 154341, "cache_read": 55653787, "cache_creation": 455015 },
    "tools": { "calls": 200, "results": 197, "by_name": { "Bash": 119, "Edit": 41, "Read": 24, "Write": 12 } },
    "evidence_before_edit": { "edits": 43, "informed": 41, "blind": 2, "creates": 10, "verify_calls": 119, "rate": 0.9535 },
    "steering": { "prompts": 11, "commands": 3, "interrupts": 0, "turns_per_prompt": 15 },
    "invalid_actions": {
      "tool_calls": 200, "tool_failures": 1, "rate": 0.005, "api_errors": 7,
      "by_signal": { "record_error": 7, "api_retry": 6, "api_error_message": 1, "tool_result_error_text": 1, "tool_result_is_error": 1 }
    },
    "sidechain_records": 0,
    "unparsable_lines": 0
  }
}
```

That is a real record, from this repo's own session log.

`metrics` is counts, ratios, model ids and timestamps. **No prompt text, file content, command
output, or file path survives extraction** — that is the artifact Phase 4 publishes, so the
redaction boundary is enforced where the data is derived, not where it is sent. Tests assert it
directly: a transcript containing a fake secret and a fake file path produces a record containing
neither.

### Extraction happens at capture time, on purpose

Phase 1 stored a *pointer* to each transcript and flagged the consequence as its most serious open
issue: Claude Code owns that directory and prunes it, so a store of pointers quietly loses its own
history. For a product whose entire claim is an accumulating journey, that is fatal. Metrics are now
derived during the hook, so a session survives its transcript.

Cost: a second pass over the file, measured at roughly 5 ms per MB — about 25 ms for this repo's
4.4 MB log, against a 10 s hook budget.

## What gets measured, and what each number refuses to say

| Field | Meaning | The line it will not cross |
|---|---|---|
| `models` | Exact model ids, counted per turn | Never a family name. "Which models you reach for" is only a claim if it survives a version bump |
| `tokens` | input / output / cache read / cache creation | Deduplicated per message id — see below |
| `evidence_before_edit` | Edits to files that had been read first | Creating a file is not a blind edit, and is bucketed as `creates` |
| `steering` | Typed prompts, slash commands and interrupts, kept apart | Tool results and harness-injected text are not a person steering |
| `invalid_actions` | Failed tool calls over total tool calls | A dropped connection is not your invalid action rate |
| `duration_ms` | Wall-clock span, first record to last | Includes idle time. It is elapsed time, not time spent working |

Rates are `null`, never `0`, when there is no denominator. A session with no edits has no
Evidence-Before-Edit rate; reporting `0%` would read as editing blind every time.

## Four traps, and what happens without them

Each of these was found by running the extractor against real session logs, not by reading a spec.
Each produces a confidently wrong number that would go straight onto a public profile.

**1. Token counts double.** Claude Code writes one JSONL line *per content block*, and every line
repeats the same `message.usage` object. This repo's own session is 399 assistant records across 211
distinct message ids. Summing per record reports **351,282 output tokens for a session that spent
154,341** — a 2.3× inflation. Usage and turn counts are keyed on `message.id`.

**2. Failures hide from `is_error`.** A failed Bash call arrives as a *string* `toolUseResult`
reading `"Error: Exit code 1"`. API trouble never touches the tool_result at all — it appears as a
top-level `error`, an `isApiErrorMessage`, or a `retryAttempt`. A reader that checks only `is_error`
scores a session with known failures as 100% clean.

**3. `stderr` is not failure.** The obvious fix for trap 2 is to treat a non-empty `stderr` as a
failed command. Every non-empty `stderr` across this repo's two session logs is the benign
`"Shell cwd was reset"` notice from a command that exited 0. That fix invents failures that never
happened.

**4. MCP tool names can carry an account identifier.** Tools are named `mcp__<server>__<tool>`. Some
servers are named for what they are (`mcp__gbrain__search`) — worth showing. Others are named with
the connector's instance id (`mcp__93e19283-bb1c-425b-be2d-32f39f61705c__notion-fetch`), which
identifies a person's account rather than how they build. UUID-shaped server segments are replaced
with `<connector>`; readable ones are kept. The tool name is the only field here assembled from user
configuration rather than a fixed vocabulary, which is exactly why it is the one that leaks.

## The journey across sessions

[lib/journey.mjs](lib/journey.mjs) reads the store and reports totals plus the direction of travel.
Two things it refuses to do, because both put a false number on a profile:

**It never averages a ratio across sessions.** A session with one edit and a session with a hundred
are not equal evidence. Mean-of-ratios scores a 1-edit miss next to a 100-edit clean run as 50%; the
truth is 99%. Rates are always recomputed from pooled numerators and denominators.

**It never reports a trend from thin history.** Below six extracted sessions there is no trend, just
`trend_unavailable_reason` saying how many are needed and how many exist. Two sessions is not a
journey, it is noise with a direction.

Deltas are `recent − earlier`, so the sign follows the metric and never a notion of "good": a rising
Evidence-Before-Edit delta means the habit improved, and a rising invalid-action delta means it got
worse. A window with no denominator yields a `null` delta rather than a number standing in for
absent evidence.

Sessions with no `metrics` — Phase 1 records, or transcripts already gone at capture time — are
counted as `unextracted` rather than as sessions that scored zero.

## Permissions

`~/.gems/` is created `0700` and its files `0600`. The store names repositories, working
directories, transcript paths, session ids, and activity times; under a default umask on a shared
machine, other local accounts could otherwise read all of it.

Note the asymmetry: the **local store** holds paths, because it is yours and it is `0600`. The
**`metrics` object** holds none, because that is the part designed to leave.

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

Extraction is the enhancement, not the floor. A transcript that cannot be parsed still produces a
record with `metrics: null` — a session that happened is worth recording even when nothing could be
read from it. A partially-written trailing line is counted in `unparsable_lines` rather than
discarding the session.

Transcripts over 32 MB are recorded from `stat` alone, with `lines: null` and `metrics: null`. The
hook has a 10 s timeout and an external kill skips this script's own error handling.

## Duplicates and resumed sessions

`SessionEnd` can fire more than once for a session that gets resumed. Records are deduplicated on
`(session_id, bytes)`: re-ending an unchanged session is skipped, while a resumed session that ended
larger appends a new record.

Readers take the **last record per `session_id`** — `latestPerSession` in
[lib/journey.mjs](lib/journey.mjs). The earlier records are prefixes of the later one, so summing all
of them would count the same work twice.

The dedupe check reads only the last 64 KB of the store. This hook runs on every session end and the
store only grows, so scanning the whole file would make each capture slower than the last. Duplicate
`SessionEnd` events arrive seconds apart, so the tail is where they always are. The accepted
tradeoff: a duplicate older than 64 KB of history would be appended again, which is harmless because
readers take the last record per session.

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

## Layout

| File | What it owns |
|---|---|
| [.claude-plugin/plugin.json](.claude-plugin/plugin.json) | Manifest |
| [hooks/hooks.json](hooks/hooks.json) | Declares the `SessionEnd` hook |
| [hooks/capture-session.mjs](hooks/capture-session.mjs) | Locates the transcript, extracts, appends one store record |
| [lib/extract.mjs](lib/extract.mjs) | One transcript → one metrics object. Pure, streaming, no I/O beyond the read |
| [lib/journey.mjs](lib/journey.mjs) | The store → totals and evolution deltas |

## Tests

```bash
bun run test:plugin
```

53 tests. Scoped to `plugin/` on purpose — an unscoped `bun test` would also collect the Playwright
spec in `tests/e2e/`, which needs a browser and a dev server.

```bash
bun run typecheck:plugin
```

## Trying it by hand

```bash
echo '{"session_id":"<a-real-session-id>","cwd":"'"$PWD"'"}' | GEMS_HOME=/tmp/gems-probe node plugin/hooks/capture-session.mjs && cat /tmp/gems-probe/sessions.jsonl
```

Find a real session id with `ls ~/.claude/projects/`. To read a journey out of a store:

```bash
node -e "import('./plugin/lib/journey.mjs').then(j=>console.log(JSON.stringify(j.buildJourney(j.readStore(process.env.HOME+'/.gems/sessions.jsonl').records),null,2)))"
```

## Not done yet

- Only reads Claude Code. Codex (`~/.codex/sessions/`) and Cursor come later.
- **A nonzero Bash exit is only detectable when the harness marks it.** A command that fails while
  exiting 0 — a test runner that prints failures and returns success, say — is invisible here. The
  invalid action rate measures failed *tool calls*, not failed work, and should not be described as
  the latter.
- Assumes `node` is on `PATH`. The plugin neither bundles a runtime nor checks for one, so if `node`
  is missing the shell fails before the script runs and no diagnostic is written. This matches how
  the first-party Vercel plugin invokes its own hooks.
