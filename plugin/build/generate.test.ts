import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HEADER } from './hosts.mjs';
import { parseTemplate, render, renderAll } from './generate.mjs';

const PLUGIN_ROOT = join(import.meta.dir, '..');
const CANONICAL_CLAUDE = join(PLUGIN_ROOT, 'commands', 'gems.md');
const TEMPLATE = join(PLUGIN_ROOT, 'skill', 'gems.tmpl.md');

test('rendering is deterministic', () => {
  expect(render('codex')).toBe(render('codex'));
  expect(render('claude-code')).toBe(render('claude-code'));
});

test('every generated host carries the AUTO-GENERATED header', () => {
  for (const contents of Object.values(renderAll())) {
    expect(contents).toContain(HEADER);
  }
});

test('the generated Claude command matches the canonical hand-authored plugin, minus the header', () => {
  // The shipped Claude plugin at commands/gems.md is the source of truth for what Claude installs.
  // Stripping the one generated header line must recover it exactly — that is what stops the
  // single-source template from silently drifting from the plugin already in the marketplace.
  const generated = render('claude-code').replace(`${HEADER}\n`, '');
  expect(generated).toBe(readFileSync(CANONICAL_CLAUDE, 'utf8'));
});

test('the template description is the same string the canonical Claude command ships', () => {
  const { fields } = parseTemplate(readFileSync(TEMPLATE, 'utf8'));
  const canonical = /^description:\s*(.*)$/m.exec(readFileSync(CANONICAL_CLAUDE, 'utf8'));
  expect(canonical).not.toBeNull();
  expect(JSON.parse(canonical![1])).toBe(fields.description);
});

test('Codex frontmatter is limited to name + description', () => {
  const codex = render('codex');
  const fm = /^---\n([\s\S]*?)\n---/.exec(codex)![1];
  const keys = fm
    .split('\n')
    .map((l) => /^([a-z-]+):/.exec(l)?.[1])
    .filter(Boolean);
  expect(keys).toEqual(['name', 'description']);
});

test('Codex invocation shells out to the shared engine via $GEMS_ROOT', () => {
  const codex = render('codex');
  expect(codex).toContain('node "$GEMS_ROOT/commands/gems.mjs" capture');
  expect(codex).toContain('GEMS_ROOT="$HOME/.codex/skills/gems"');
  // Codex must not carry Claude's executable-fence or plugin-root variable.
  expect(codex).not.toContain('```!');
  expect(codex).not.toContain('CLAUDE_PLUGIN_ROOT');
});

test('an over-limit description is rejected rather than silently truncated', () => {
  const longDesc = 'x'.repeat(2000);
  const template = `---\nname: gems\ndescription: ${JSON.stringify(longDesc)}\n---\n\n# Gems\n\n{{RUN}}\n`;
  expect(() => render('codex', template)).toThrow(/over the 1024 limit/);
  // Claude has no ceiling, so the same template renders fine there.
  expect(() => render('claude-code', template)).not.toThrow();
});

test('committed dist/ is current (freshness gate mirror of `gen:plugin --check`)', () => {
  for (const [rel, contents] of Object.entries(renderAll())) {
    const onDisk = readFileSync(join(PLUGIN_ROOT, 'dist', rel), 'utf8');
    expect(onDisk).toBe(contents);
  }
});
