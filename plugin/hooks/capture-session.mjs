#!/usr/bin/env node
// Gems — SessionEnd capture.
//
// Claude Code runs this when a session ends, piping a JSON payload on stdin that
// carries `session_id` and `cwd`. We locate that session's transcript, derive metrics
// from it, and append one record to a local store.
//
// The capture logic itself lives in `../lib/capture.mjs`, shared with `gems capture`
// (the scan-all, works-on-any-CLI path). This file is just the Claude Code hook shell:
// read stdin, capture one session, and — because a hook that throws disrupts someone's
// session — degrade every failure path to "write a diagnostic line and exit 0".
//
// The derived record holds counts, ratios, model ids and timestamps only. No prompt text,
// file content, command output, or file path is read into it — see `../lib/extract.mjs`.

import { fileURLToPath } from 'node:url';

import { captureOne, diagnose, gemsHome } from '../lib/capture.mjs';

// Re-exported for back-compat with existing importers and tests, which reach for these
// symbols through the hook module. The definitions now live in `../lib/capture.mjs`.
export {
  appendRecord,
  buildRecord,
  captureOne as capture,
  captureAll,
  captureOne,
  captureTranscript,
  diagnose,
  enumerateSessions,
  gemsHome,
  isSafeSessionId,
  locateTranscript,
  measureTranscript,
  parseHookInput,
  projectSlug,
  sources,
  SCHEMA_VERSION,
} from '../lib/capture.mjs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  readStdin()
    .then((raw) => captureOne({ raw }))
    .catch((err) => {
      try {
        diagnose(gemsHome(), `error: ${err?.message ?? String(err)}`);
      } catch {
        // fall through
      }
    })
    .finally(() => process.exit(0));
}
