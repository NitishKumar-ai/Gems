---
name: gems
description: "View your builder journey — sessions, rates, evolution and achievements"
---
<!-- AUTO-GENERATED from skill/gems.tmpl.md — do not edit. Regenerate: bun run gen:plugin -->

# Gems

Run these with your shell tool. The first captures any new sessions from every CLI — Gems
reads transcripts off disk, so capture works without a session-end hook — and the second
renders the journey:

    GEMS_ROOT="$HOME/.codex/skills/gems"
    node "$GEMS_ROOT/commands/gems.mjs" capture
    node "$GEMS_ROOT/commands/gems.mjs"

To publish to your public profile, run `node "$GEMS_ROOT/commands/gems.mjs" publish` in place
of the second command.

The script's output above is the answer. Show it to the user as it came out — the numbers are
already formatted, and every rate it prints is pooled from raw counts rather than averaged, so
recomputing or rounding anything here would misstate it.

Do not add an assessment of whether the numbers are good. This is a record, not a review.

If it reports no sessions captured yet, say the hook records a session when one *ends*, so the
first entry appears after the current session closes.

If `publish` was requested and it failed:

- **409** — the account has no GitHub handle on record. They need to sign in again at `/dashboard`.
- **403** — they asked to publish under a handle that is not theirs. The error names the handle
  the API key actually owns; publishing without `--username` uses it automatically.
- **401** — `GEMS_API_KEY` is missing or stale. It is shown on `/dashboard`.
  Tell the user they can set it via `/gems login <API_KEY>`.
