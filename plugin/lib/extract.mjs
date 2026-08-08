#!/usr/bin/env node
// Gems Phase 2 — transcript extractor.
//
// Turns one Claude Code session transcript into derived metrics. Everything here is a
// count, a ratio, a model id, or a timestamp. No prompt text, file content, command
// output, or file path ever survives into the output — Phase 4 publishes this artifact,
// so the redaction boundary has to hold at the point of extraction, not at the point of
// publishing.
//
// The transcript is line-delimited JSON. Records are read as a stream and parsed one at a
// time: a session log runs to megabytes, and this is called from a hook with a 10s budget.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export const METRICS_SCHEMA_VERSION = 1;

// Tools whose result tells you what a file currently contains.
const EVIDENCE_TOOLS = new Set(['Read', 'NotebookRead']);
// Tools that change a file. `Edit` requires the file to already exist, so every Edit is a
// mutation of something. `Write` can create, which is not a blind edit — you cannot read a
// file that does not exist yet — so Write only counts once its result says `update`.
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit']);
const WRITE_TOOLS = new Set(['Write']);
// Tools that run a check rather than change something. Used for the "tested before editing"
// half of Evidence-Before-Edit.
const VERIFY_TOOLS = new Set(['Bash', 'BashOutput']);

// Claude Code records a synthetic assistant turn for locally-generated messages. It carries
// no real model identity and counting it would attribute work to a model that never ran.
const SYNTHETIC_MODEL = '<synthetic>';

// A connector-instance id inside an MCP tool name — a UUID or a long hex blob.
const OPAQUE_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i;

/**
 * MCP tools are named `mcp__<server>__<tool>`. Some servers are named for what they are
 * (`mcp__gbrain__search`), which is exactly the kind of thing a profile should show. Others
 * are named with the connector's instance id — `mcp__93e19283-bb1c-...__notion-create-pages`
 * — which is an identifier tied to one person's account, not a fact about how they build.
 *
 * Found by running this extractor over real sessions, not by reading a spec. The tool name
 * is the one field here assembled from user configuration rather than from a fixed
 * vocabulary, so it is the one field that can carry an identifier out.
 */
export function normalizeToolName(name) {
  if (typeof name !== 'string' || !name.startsWith('mcp__')) return name;

  const parts = name.split('__');
  if (parts.length < 3) return name;

  const server = parts[1];
  if (!OPAQUE_ID.test(server)) return name;

  return `mcp__<connector>__${parts.slice(2).join('__')}`;
}

/**
 * Assistant messages are recorded one JSONL line per content block, and every line repeats
 * the same `message.usage` object. This session's own log has 399 assistant records across
 * 211 distinct message ids; summing usage per record reports 351,282 output tokens for a
 * session that actually spent 154,341. That is a 2.3x inflation on a number headed for a
 * public profile, so usage and turn counts are both keyed on `message.id`.
 *
 * Falls back to counting the record when a message carries no id, which is rarer but real —
 * dropping those would under-count instead, and under-counting is not more honest.
 */
function usageKey(record, index) {
  const id = record?.message?.id;
  return typeof id === 'string' && id.length > 0 ? id : `__record_${index}`;
}

function toArray(content) {
  return Array.isArray(content) ? content : [];
}

/**
 * Human input, as distinct from the harness talking to itself. A `user` record is just as
 * often a tool result being fed back, a queued task notification, or a resume stub, and
 * counting those as steering would say someone directed the agent 200 times in a session
 * where they typed twice.
 */
export function classifyUserRecord(record) {
  if (record?.isMeta === true) return 'meta';

  const content = record?.message?.content;

  if (Array.isArray(content)) {
    if (content.some((block) => block?.type === 'tool_result')) return 'tool_result';
    const text = content
      .filter((block) => block?.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    return classifyPromptText(text);
  }

  if (typeof content === 'string') return classifyPromptText(content);

  return 'other';
}

/**
 * Slash commands and typed prompts are both a person steering, but they are not the same
 * act, so they stay in separate buckets. Everything in angle-bracket tags is the harness
 * injecting context and is not the person at all.
 */
function classifyPromptText(text) {
  if (typeof text !== 'string') return 'other';
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'other';

  if (trimmed.includes('[Request interrupted by user')) return 'interrupt';
  if (trimmed.startsWith('<command-message>') || trimmed.startsWith('<command-name>')) return 'command';
  if (
    trimmed.startsWith('<task-notification>') ||
    trimmed.startsWith('<system-reminder>') ||
    trimmed.startsWith('<local-command-stdout>') ||
    trimmed.startsWith('<user-memory-input>')
  ) {
    return 'injected';
  }

  return 'prompt';
}

/**
 * Every way a session records something going wrong. The naive reader looks only at
 * `is_error` on the tool_result block and scores a session with known failures as clean:
 * a failed Bash call in this repo's own log arrives as a *string* `toolUseResult` reading
 * "Error: Exit code 1", and API trouble never touches the tool_result at all.
 *
 * Returns a list because one record can carry more than one signal.
 *
 * Deliberately NOT a signal: a non-empty `stderr`. Every non-empty stderr in this repo's
 * two session logs is the benign "Shell cwd was reset" notice from a command that
 * succeeded. Treating stderr as failure would invent failures that did not happen.
 */
export function failureSignals(record) {
  const signals = [];
  if (!record || typeof record !== 'object') return signals;

  for (const block of toArray(record.message?.content)) {
    if (block?.type === 'tool_result' && block.is_error === true) {
      signals.push('tool_result_is_error');
      break;
    }
  }

  const result = record.toolUseResult;
  if (typeof result === 'string' && /^\s*error\b/i.test(result)) {
    signals.push('tool_result_error_text');
  }

  if (record.isApiErrorMessage === true) signals.push('api_error_message');
  if (record.error !== undefined && record.error !== null) signals.push('record_error');
  if (record.retryAttempt !== undefined && record.retryAttempt !== null) signals.push('api_retry');

  return signals;
}

/** A tool call the person stopped mid-flight. That is steering, not a failed action. */
function isInterrupted(record) {
  const result = record?.toolUseResult;
  return !!result && typeof result === 'object' && result.interrupted === true;
}

function newAccumulator() {
  return {
    models: new Map(),
    tools: new Map(),
    failureSignals: new Map(),
    seenMessages: new Set(),
    readFiles: new Set(),
    globalEvidence: false,
    pendingWrites: new Map(),
    eventSequence: [],

    assistantTurns: 0,
    syntheticTurns: 0,
    sidechainRecords: 0,
    toolCalls: 0,
    toolResults: 0,
    toolFailures: 0,
    apiErrors: 0,
    interrupts: 0,

    prompts: 0,
    commands: 0,

    edits: 0,
    informedEdits: 0,
    creates: 0,
    verifyCalls: 0,

    tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 },

    firstTimestamp: null,
    lastTimestamp: null,

    records: 0,
    unparsableLines: 0,
  };
}

function bump(map, key) {
  if (key === undefined || key === null) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function noteTimestamp(acc, record) {
  const ts = record?.timestamp;
  if (typeof ts !== 'string' || ts.length === 0) return;
  if (acc.firstTimestamp === null || ts < acc.firstTimestamp) acc.firstTimestamp = ts;
  if (acc.lastTimestamp === null || ts > acc.lastTimestamp) acc.lastTimestamp = ts;
}

function absorbAssistant(acc, record, index) {
  const model = record.message?.model;

  if (model === SYNTHETIC_MODEL) {
    acc.syntheticTurns += 1;
  }

  const key = usageKey(record, index);
  const firstSightOfMessage = !acc.seenMessages.has(key);
  if (firstSightOfMessage) {
    acc.seenMessages.add(key);

    if (typeof model === 'string' && model !== SYNTHETIC_MODEL) {
      acc.assistantTurns += 1;
      bump(acc.models, model);
    }

    const usage = record.message?.usage;
    if (usage && typeof usage === 'object') {
      acc.tokens.input += Number(usage.input_tokens) || 0;
      acc.tokens.output += Number(usage.output_tokens) || 0;
      acc.tokens.cache_read += Number(usage.cache_read_input_tokens) || 0;
      acc.tokens.cache_creation += Number(usage.cache_creation_input_tokens) || 0;
    }
  }

  // Tool calls are per content block, so they are counted from every record rather than
  // only the first sighting of a message id — the blocks differ line to line.
  for (const block of toArray(record.message?.content)) {
    if (block?.type !== 'tool_use') continue;
    acc.toolCalls += 1;
    bump(acc.tools, normalizeToolName(block.name));
    absorbToolUse(acc, block, model, record.timestamp);
  }
}

function absorbToolUse(acc, block, model, timestamp) {
  const name = normalizeToolName(block.name);
  const filePath = block.input?.file_path;
  
  if (model && timestamp) {
    acc.eventSequence.push({
      id: block.id || Math.random().toString(36).substring(7),
      name,
      model,
      timestamp
    });
  }

  if (VERIFY_TOOLS.has(name)) {
    acc.verifyCalls += 1;
    return;
  }

  if (name === 'Grep') {
    acc.globalEvidence = true;
    return;
  }

  if (typeof filePath !== 'string' || filePath.length === 0) return;

  if (EVIDENCE_TOOLS.has(name)) {
    acc.readFiles.add(filePath);
    return;
  }

  if (EDIT_TOOLS.has(name)) {
    countEdit(acc, filePath);
    return;
  }

  if (WRITE_TOOLS.has(name) && typeof block.id === 'string') {
    // Held until the result says whether this created a file or overwrote one.
    acc.pendingWrites.set(block.id, filePath);
  }
}

function countEdit(acc, filePath) {
  acc.edits += 1;
  if (acc.readFiles.has(filePath) || acc.globalEvidence) acc.informedEdits += 1;
  // After changing a file you know what is in it, so later edits to it are informed.
  acc.readFiles.add(filePath);
}

/**
 * A `Write` result resolves the one thing the call itself cannot tell you: whether a file
 * was created or overwritten. Creating is not editing blind.
 */
function resolvePendingWrites(acc, record) {
  if (acc.pendingWrites.size === 0) return;

  for (const block of toArray(record.message?.content)) {
    if (block?.type !== 'tool_result') continue;
    const id = block.tool_use_id;
    if (typeof id !== 'string' || !acc.pendingWrites.has(id)) continue;

    const filePath = acc.pendingWrites.get(id);
    acc.pendingWrites.delete(id);

    const kind = record.toolUseResult && typeof record.toolUseResult === 'object' ? record.toolUseResult.type : null;
    if (kind === 'create') {
      acc.creates += 1;
      acc.readFiles.add(filePath);
    } else {
      countEdit(acc, filePath);
    }
  }
}

function absorbUser(acc, record) {
  const kind = classifyUserRecord(record);

  if (kind === 'prompt') acc.prompts += 1;
  else if (kind === 'command') acc.commands += 1;
  else if (kind === 'interrupt') acc.interrupts += 1;

  if (kind === 'tool_result') {
    acc.toolResults += 1;
    resolvePendingWrites(acc, record);
  }

  if (isInterrupted(record)) acc.interrupts += 1;
}

function absorbFailures(acc, record) {
  const signals = failureSignals(record);
  if (signals.length === 0) return;

  for (const signal of signals) bump(acc.failureSignals, signal);

  // Two different things wear the word "error". A failed tool call is the person's session
  // going wrong and belongs in the invalid action rate. A transport retry or an API outage
  // is the network, and folding it into the same ratio would score someone worse for
  // having bad wifi. Both are counted; only the first drives the headline number.
  const toolFailed = signals.includes('tool_result_is_error') || signals.includes('tool_result_error_text');
  const apiFailed =
    signals.includes('api_error_message') || signals.includes('record_error') || signals.includes('api_retry');

  if (toolFailed) acc.toolFailures += 1;
  else if (apiFailed) acc.apiErrors += 1;
}

export function absorbRecord(acc, record, index) {
  if (!record || typeof record !== 'object') return;

  acc.records += 1;
  noteTimestamp(acc, record);

  if (record.isSidechain === true) acc.sidechainRecords += 1;

  absorbFailures(acc, record);

  if (record.type === 'assistant') absorbAssistant(acc, record, index);
  else if (record.type === 'user') absorbUser(acc, record);
}

function ratio(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))));
}

export function summarize(acc) {
  const durationMs =
    acc.firstTimestamp && acc.lastTimestamp
      ? Math.max(0, Date.parse(acc.lastTimestamp) - Date.parse(acc.firstTimestamp))
      : null;

  const blindEdits = acc.edits - acc.informedEdits;

  return {
    schema: METRICS_SCHEMA_VERSION,

    started_at: acc.firstTimestamp,
    ended_at: acc.lastTimestamp,
    duration_ms: Number.isFinite(durationMs) ? durationMs : null,

    // Exact ids, never a family name. "Which models you actually reach for" is only a
    // claim if it survives a version bump.
    models: sortedCounts(acc.models),

    turns: {
      assistant: acc.assistantTurns,
      synthetic: acc.syntheticTurns,
      prompts: acc.prompts,
      commands: acc.commands,
      records: acc.records,
    },

    tokens: { ...acc.tokens },

    tools: {
      calls: acc.toolCalls,
      results: acc.toolResults,
      by_name: sortedCounts(acc.tools),
    },

    evidence_before_edit: {
      edits: acc.edits,
      informed: acc.informedEdits,
      blind: blindEdits,
      creates: acc.creates,
      verify_calls: acc.verifyCalls,
      rate: ratio(acc.informedEdits, acc.edits),
    },

    steering: {
      prompts: acc.prompts,
      commands: acc.commands,
      interrupts: acc.interrupts,
      // How far the agent runs between human inputs. Low means tight steering, high means
      // letting it run — stated as-is, because neither end is the good end.
      turns_per_prompt: ratio(acc.assistantTurns, acc.prompts + acc.commands),
    },

    invalid_actions: {
      tool_calls: acc.toolCalls,
      tool_failures: acc.toolFailures,
      rate: ratio(acc.toolFailures, acc.toolCalls),
      api_errors: acc.apiErrors,
      by_signal: sortedCounts(acc.failureSignals),
    },

    replay_events: acc.eventSequence,
    sidechain_records: acc.sidechainRecords,
    unparsable_lines: acc.unparsableLines,
  };
}

/**
 * The derived artifact, and the only shape Phase 4 is allowed to publish.
 *
 * @typedef {ReturnType<typeof summarize>} SessionMetrics
 */

/**
 * Read a transcript and derive its metrics. Resolves `null` when the file cannot be read,
 * so callers can degrade rather than branch on an exception.
 *
 * @returns {Promise<SessionMetrics | null>}
 */
export function extractTranscript(path) {
  return new Promise((resolve) => {
    const acc = newAccumulator();
    let index = 0;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let stream;
    try {
      stream = createReadStream(path);
    } catch {
      finish(null);
      return;
    }

    stream.on('error', () => finish(null));

    const lines = createInterface({ input: stream, crlfDelay: Infinity });

    lines.on('line', (line) => {
      if (line.length === 0) return;
      index += 1;
      try {
        absorbRecord(acc, JSON.parse(line), index);
      } catch {
        // A transcript is appended to while a session runs, so the last line can be a
        // partial write. One unreadable line is not a reason to lose the session.
        acc.unparsableLines += 1;
      }
    });

    lines.on('error', () => finish(null));
    lines.on('close', () => finish(summarize(acc)));
  });
}
