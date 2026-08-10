import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectHosts, install, installHost } from './install.mjs';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'gems-install-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function env() {
  return { ...process.env, HOME: home };
}

test('installing Codex lays the skill + engine into ~/.codex/skills/gems', () => {
  const result = installHost('codex', { env: env() });
  const dir = join(home, '.codex', 'skills', 'gems');

  expect(result.dir).toBe(dir);
  // Engine copied structure-preserved so `commands/gems.mjs`'s `../lib` imports resolve.
  expect(existsSync(join(dir, 'commands', 'gems.mjs'))).toBe(true);
  expect(existsSync(join(dir, 'lib', 'capture.mjs'))).toBe(true);
  expect(existsSync(join(dir, 'lib', 'journey.mjs'))).toBe(true);
  // The generated skill, carrying the auto-generated header.
  const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  expect(skill).toContain('AUTO-GENERATED');
  expect(skill).toContain('node "$GEMS_ROOT/commands/gems.mjs" capture');
});

test('tests are not copied into an install', () => {
  installHost('codex', { env: env() });
  expect(existsSync(join(home, '.codex', 'skills', 'gems', 'lib', 'capture.test.ts'))).toBe(false);
});

test('re-installing is idempotent', () => {
  installHost('codex', { env: env() });
  const second = installHost('codex', { env: env() });
  expect(second.dir).toBe(join(home, '.codex', 'skills', 'gems'));
  expect(existsSync(join(second.dir!, 'SKILL.md'))).toBe(true);
});

test('Claude Code is reported as marketplace-managed, not copied', () => {
  const result = installHost('claude-code', { env: env() });
  expect(result.skipped).toBe(true);
  expect(result.reason).toContain('marketplace');
  expect(existsSync(join(home, '.claude', 'skills'))).toBe(false);
});

test('detectHosts sees a CLI by its home directory', () => {
  expect(detectHosts(env())).toEqual([]);
  mkdirSync(join(home, '.codex'), { recursive: true });
  expect(detectHosts(env())).toEqual(['codex']);
  mkdirSync(join(home, '.claude'), { recursive: true });
  expect(detectHosts(env()).sort()).toEqual(['claude-code', 'codex']);
});

test('install(all) covers every host, skipping Claude', () => {
  const results = install({ only: 'all', env: env() });
  const byHost = Object.fromEntries(results.map((r) => [r.host, r]));
  expect(byHost['codex'].dir).toBe(join(home, '.codex', 'skills', 'gems'));
  expect(byHost['claude-code'].skipped).toBe(true);
});
