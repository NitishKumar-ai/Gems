#!/usr/bin/env node
// Gems — SessionEnd capture.
//
// Claude Code runs this when a session ends, piping a JSON payload on stdin that
// carries `session_id` and `cwd`. We locate that session's transcript, derive metrics
// from it, and append one record to a local store.
//
// Extraction happens **here**, at capture time, rather than later on demand. Claude Code
// owns the transcript directory and prunes it; a store that only pointed at those files
// would quietly lose its own history, which is fatal for a product whose entire claim is
// an accumulating journey. Phase 1 shipped with that risk noted as its most serious open
// issue. This closes it: once a session is captured, the derived metrics survive the
// transcript.
//
// The derived record holds counts, ratios, model ids and timestamps only. No prompt text,
// file content, command output, or file path is read into it — see `lib/extract.mjs`.
//
// A hook that throws is a hook that disrupts someone's session, so every failure
// path here degrades to "write a diagnostic line and exit 0".

import {
  appendFileSync,
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { extractTranscript } from '../lib/extract.mjs';

// 2 adds the derived `metrics` object. A schema 1 record is a valid, metric-less session;
// readers treat a missing `metrics` as thin history rather than as zeroes.
export const SCHEMA_VERSION = 2;

// This store names repositories, working directories, transcript paths, session ids and
// activity times. On a shared machine a default umask would let other accounts read it.
const OWNER_ONLY_DIR = 0o700;
const OWNER_ONLY_FILE = 0o600;

const MAX_DIAGNOSTIC_LINES = 500;
// Session transcripts are line-delimited JSON and grow with conversation length.
// Past this size we record the session from stat alone rather than walk it — the hook
// has a 10s timeout, and an external kill skips this script's own error handling.
const MAX_LINE_COUNT_BYTES = 32 * 1024 * 1024;
// Dedupe only needs the recent tail of the store, not its whole history.
const DEDUPE_TAIL_BYTES = 64 * 1024;

export function gemsHome(env = process.env) {
  return env.GEMS_HOME || join(homedir(), '.gems');
}

export function claudeProjectsDir(env = process.env) {
  return env.GEMS_CLAUDE_PROJECTS || join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
}

export function codexSessionsDir(env = process.env) {
  return env.GEMS_CODEX_SESSIONS || join(homedir(), '.codex', 'sessions');
}

export function cursorSessionsDir(env = process.env) {
  return env.GEMS_CURSOR_SESSIONS || join(homedir(), '.cursor', 'sessions');
}

/**
 * Claude Code names each project directory after its absolute path with the
 * separators flattened: `/Volumes/NIT-SSD/Development/Gems` becomes
 * `-Volumes-NIT-SSD-Development-Gems`. Dots flatten too, which is why
 * `.../Class-mode/.claude/worktrees/...` lands as `...Class-mode--claude-worktrees-...`.
 *
 * This is a fast path only. `locateTranscript` falls back to a scan, because the
 * naming rule is Claude Code's to change and session ids are unique on their own.
 */
export function projectSlug(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return null;
  return cwd.replace(/[/.]/g, '-');
}

export function isSafeSessionId(sessionId) {
  return typeof sessionId === 'string' && /^[a-zA-Z0-9_-]+$/.test(sessionId);
}

/**
 * `existsSync` also matches directories, and a directory named `<id>.jsonl` is not a
 * transcript — it would otherwise be recorded with the directory's own size.
 */
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Find `<session_id>.jsonl`. Tries the slug derived from cwd first, then scans every
 * project directory — a session can be recorded under a different project than the
 * cwd we were handed (worktrees, `cd` mid-session).
 */
export function locateTranscript(sessionId, cwd, projectsDir) {
  if (!isSafeSessionId(sessionId)) return null;
  if (!existsSync(projectsDir)) return null;

  const filename = `${sessionId}.jsonl`;

  const slug = projectSlug(cwd);
  if (slug) {
    const fastPath = join(projectsDir, slug, filename);
    if (isFile(fastPath)) return fastPath;
  }

  let entries;
  try {
    entries = readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(projectsDir, entry.name, filename);
    if (isFile(candidate)) return candidate;
  }

  // Also check if it's flat in the root directory (for Codex/Cursor)
  const flatPath = join(projectsDir, filename);
  if (isFile(flatPath)) return flatPath;

  return null;
}

/**
 * Count newlines and bytes in ONE pass. Reading the size separately from the content
 * lets the two disagree when the transcript grows mid-capture, which would publish a
 * byte count and a line count describing different versions of the same session.
 *
 * `indexOf` is a native scan; a per-byte JS loop over a large transcript is slow enough
 * to risk the hook's timeout, which kills the process before its own error handling runs.
 */
export function measureTranscript(path) {
  return new Promise((resolve) => {
    let lines = 0;
    let bytes = 0;
    const stream = createReadStream(path);
    stream.on('data', (chunk) => {
      bytes += chunk.length;
      let at = chunk.indexOf(0x0a);
      while (at !== -1) {
        lines += 1;
        at = chunk.indexOf(0x0a, at + 1);
      }
    });
    stream.on('error', () => resolve(null));
    stream.on('end', () => resolve({ bytes, lines }));
  });
}

export function parseHookInput(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} args
 * @param {string} args.sessionId
 * @param {string | null} [args.cwd]
 * @param {string} args.transcriptPath
 * @param {number} args.bytes
 * @param {number | null} args.lines
 * @param {string} args.capturedAt
 * @param {import('../lib/extract.mjs').SessionMetrics | null} [args.metrics]
 * @param {string} [args.source]
 */
export function buildRecord({ sessionId, cwd, transcriptPath, bytes, lines, capturedAt, metrics = null, source = 'claude-code' }) {
  return {
    schema: SCHEMA_VERSION,
    source,
    session_id: sessionId,
    cwd: cwd ?? null,
    project_slug: projectSlug(cwd),
    transcript_path: transcriptPath,
    captured_at: capturedAt,
    bytes,
    lines,
    metrics,
  };
}

/**
 * Read at most the last `DEDUPE_TAIL_BYTES` of the store. This runs on every session
 * end and the store only grows, so reading the whole file would make each capture
 * slower than the last. Duplicate SessionEnd events arrive seconds apart, so the tail
 * is where they always are.
 */
function readStoreTail(storePath) {
  let fd;
  try {
    const size = statSync(storePath).size;
    const length = Math.min(size, DEDUPE_TAIL_BYTES);
    if (length === 0) return '';
    const buffer = Buffer.alloc(length);
    fd = openSync(storePath, 'r');
    readSync(fd, buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Nothing useful to do if the descriptor is already gone.
      }
    }
  }
}

/**
 * Append unless an identical (session_id, bytes) record is already stored. SessionEnd
 * can fire more than once for a session that gets resumed, and a resumed session ends
 * larger than it did before — so a same-id-bigger-bytes record is a real update worth
 * keeping. Phase 2 should read the last record per session_id.
 */
export function appendRecord(storePath, record) {
  if (existsSync(storePath)) {
    const existing = readStoreTail(storePath);
    for (const line of existing.split('\n')) {
      if (!line.trim()) continue;
      try {
        const prior = JSON.parse(line);
        if (prior.session_id === record.session_id && prior.bytes === record.bytes) {
          return false;
        }
      } catch {
        // A corrupt line is not a reason to drop a good capture.
      }
    }
  }
  appendFileSync(storePath, `${JSON.stringify(record)}\n`, { mode: OWNER_ONLY_FILE });
  return true;
}

function diagnose(home, message) {
  try {
    const path = join(home, 'capture.log');
    const line = `${new Date().toISOString()} ${message}\n`;
    if (existsSync(path)) {
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
      if (lines.length >= MAX_DIAGNOSTIC_LINES) {
        writeFileSync(path, `${lines.slice(-(MAX_DIAGNOSTIC_LINES - 1)).join('\n')}\n${line}`, { mode: OWNER_ONLY_FILE });
        return;
      }
    }
    appendFileSync(path, line, { mode: OWNER_ONLY_FILE });
  } catch {
    // Diagnostics are best-effort by definition.
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function capture({
  raw,
  env = process.env,
  now = () => new Date().toISOString(),
  maxLineCountBytes = MAX_LINE_COUNT_BYTES,
}) {
  const home = gemsHome(env);
  mkdirSync(home, { recursive: true, mode: OWNER_ONLY_DIR });

  const input = parseHookInput(raw);
  const sessionId = input?.session_id ?? input?.conversation_id ?? null;

  if (!isSafeSessionId(sessionId)) {
    diagnose(home, 'skipped: no usable session id on stdin');
    return { captured: false, reason: 'no-session-id' };
  }

  const cwd = typeof input.cwd === 'string' ? input.cwd : null;
  
  const sources = [
    { name: 'claude-code', dir: claudeProjectsDir(env) },
    { name: 'codex', dir: codexSessionsDir(env) },
    { name: 'cursor', dir: cursorSessionsDir(env) }
  ];
  
  let transcriptPath = null;
  let detectedSource = null;
  
  for (const s of sources) {
    transcriptPath = locateTranscript(sessionId, cwd, s.dir);
    if (transcriptPath) {
      detectedSource = s.name;
      break;
    }
  }

  if (!transcriptPath) {
    diagnose(home, `skipped: no transcript found for ${sessionId}`);
    return { captured: false, reason: 'no-transcript' };
  }

  let statedSize = null;
  try {
    statedSize = statSync(transcriptPath).size;
  } catch {
    diagnose(home, `skipped: transcript unreadable for ${sessionId}`);
    return { captured: false, reason: 'unreadable' };
  }

  // Past the cap, record the session from stat alone rather than walking a huge file
  // and risking the hook timeout. A record without a line count still beats no record.
  let bytes = statedSize;
  let lines = null;
  let metrics = null;
  if (statedSize <= maxLineCountBytes) {
    const measured = await measureTranscript(transcriptPath);
    if (measured) {
      bytes = measured.bytes;
      lines = measured.lines;
    }

    // Extraction is a second pass over the same file. Measured at ~5ms per MB, so even at
    // the 32 MB cap it is a fraction of the hook's 10s budget — and keeping the passes
    // separate is what lets `bytes` stay the single number the dedupe key is built on.
    try {
      metrics = await extractTranscript(transcriptPath);
    } catch {
      // Extraction is the enhancement; the pointer record is the floor. A session that
      // cannot be parsed is still a session that happened.
      metrics = null;
    }

    if (!metrics) diagnose(home, `no metrics extracted for ${sessionId}; stored pointer only`);
  } else {
    diagnose(home, `transcript over cap for ${sessionId}; stored pointer only`);
  }

  const record = buildRecord({ sessionId, cwd, transcriptPath, bytes, lines, capturedAt: now(), metrics, source: detectedSource });
  const written = appendRecord(join(home, 'sessions.jsonl'), record);

  if (!written) {
    diagnose(home, `duplicate: ${sessionId} at ${bytes} bytes already stored`);
  }

  return { captured: written, record };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  readStdin()
    .then((raw) => capture({ raw }))
    .catch((err) => {
      try {
        diagnose(gemsHome(), `error: ${err?.message ?? String(err)}`);
      } catch {
        // fall through
      }
    })
    .finally(() => process.exit(0));
}
