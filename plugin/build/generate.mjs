#!/usr/bin/env node
// Gems command generator — `bun run gen:plugin`.
//
// Reads the single authoring source (`../skill/gems.tmpl.md`) and renders one command/skill file
// per host into `../dist/<host>/`, each stamped with an AUTO-GENERATED header. `gems install`
// copies these into each CLI's home. `--check` renders in memory and fails if the committed
// `dist/` is stale — a CI freshness gate, the same idea as gstack's `gen:skill-docs --dry-run`.
//
//   bun run gen:plugin            # write every host
//   bun run gen:plugin --host codex
//   bun run gen:plugin --check    # verify dist/ is current; exit 1 if not

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HEADER, HOSTS, hostIds } from './hosts.mjs';

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATE_PATH = join(PLUGIN_ROOT, 'skill', 'gems.tmpl.md');
const DIST_ROOT = join(PLUGIN_ROOT, 'dist');

/**
 * Split `---\n<frontmatter>\n---\n<body>` into parsed fields + the raw body. Only the fields the
 * hosts need are parsed (`name`, `description`, `argument-hint`); `description` and `argument-hint`
 * are JSON-quoted one-liners, so `JSON.parse` of the value recovers them exactly.
 */
export function parseTemplate(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('template is missing its frontmatter block');
  const [, fm, body] = match;

  const fields = { name: null, description: null, argumentHint: null };
  for (const line of fm.split('\n')) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    if (key === 'name') fields.name = rawValue.trim();
    else if (key === 'description') fields.description = JSON.parse(rawValue);
    else if (key === 'argument-hint') fields.argumentHint = JSON.parse(rawValue);
  }

  if (!fields.name || !fields.description) {
    throw new Error('template frontmatter must define name and description');
  }
  return { fields, body };
}

/** Render the command/skill file for one host as a string. */
export function render(hostId, template = readFileSync(TEMPLATE_PATH, 'utf8')) {
  const host = HOSTS[hostId];
  if (!host) throw new Error(`unknown host: ${hostId}`);

  const { fields, body } = parseTemplate(template);

  if (host.descriptionLimit && fields.description.length > host.descriptionLimit) {
    throw new Error(
      `${hostId}: description is ${fields.description.length} chars, over the ${host.descriptionLimit} limit`,
    );
  }

  const frontmatter = host.frontmatter(fields);
  const rendered = body.replace('{{RUN}}', () => host.run);
  return `---\n${frontmatter}\n---\n${HEADER}\n${rendered}`;
}

/** `{ 'dist/<host>/<file>': contents }` for every host (or one, when `only` is given). */
export function renderAll(only = null) {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const ids = only ? [only] : hostIds();
  const out = {};
  for (const id of ids) {
    out[join(id, HOSTS[id].outFile)] = render(id, template);
  }
  return out;
}

function writeAll(only) {
  const files = renderAll(only);
  const written = [];
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(DIST_ROOT, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
    written.push(rel);
  }
  return written;
}

/** Returns a list of stale/missing files; empty means `dist/` is current. */
function checkAll(only) {
  const files = renderAll(only);
  const stale = [];
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(DIST_ROOT, rel);
    if (!existsSync(abs) || readFileSync(abs, 'utf8') !== contents) stale.push(rel);
  }
  return stale;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const hostIdx = args.indexOf('--host');
  const only = hostIdx !== -1 ? args[hostIdx + 1] : null;

  if (args.includes('--check')) {
    const stale = checkAll(only);
    if (stale.length > 0) {
      console.error('gen:plugin --check: dist/ is stale. Run `bun run gen:plugin`. Affected:');
      for (const rel of stale) console.error(`  - dist/${rel}`);
      process.exit(1);
    }
    console.log('gen:plugin --check: dist/ is current.');
  } else {
    const written = writeAll(only);
    for (const rel of written) console.log(`wrote dist/${rel}`);
  }
}

export { DIST_ROOT, TEMPLATE_PATH };
