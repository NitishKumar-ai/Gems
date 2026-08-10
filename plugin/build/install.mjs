// `gems install` — copy the generated skill + the shared Node engine into a CLI's home.
//
// Gems reads transcripts off disk, so a CLI does not need a Gems-specific hook to be captured:
// the installed skill runs `gems capture` on invoke. This installer therefore just lays down two
// things per host — the generated command/skill file and the engine it shells out to
// (`commands/gems.mjs` + `lib/`, copied structure-preserved so its relative imports still resolve).
//
// Claude Code is the exception: it ships as a marketplace plugin (hook + command), so
// `installDir` is null there and we report that rather than laying a second, conflicting copy.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HOSTS, hostIds } from './hosts.mjs';
import { render } from './generate.mjs';

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** True when a CLI looks present — its home directory exists. */
export function detectHosts(env = process.env) {
  const home = env.HOME || '';
  const present = [];
  for (const id of hostIds()) {
    if (id === 'claude-code') {
      if (existsSync(join(home, '.claude'))) present.push(id);
    } else if (existsSync(join(home, `.${id}`))) {
      present.push(id);
    }
  }
  return present;
}

/**
 * Install one host. Idempotent: copying over an existing install just refreshes it.
 * @returns {{ host: string, skipped?: boolean, reason?: string, dir?: string, files?: string[] }}
 */
export function installHost(hostId, { env = process.env, pluginRoot = PLUGIN_ROOT } = {}) {
  const host = HOSTS[hostId];
  if (!host) throw new Error(`unknown host: ${hostId}`);
  if (!host.installDir) {
    return { host: hostId, skipped: true, reason: 'claude-code installs via the plugin marketplace' };
  }

  const dir = host.installDir(env);
  mkdirSync(dir, { recursive: true });

  // The engine, structure-preserved so `commands/gems.mjs`'s `../lib/*` imports still resolve.
  cpSync(join(pluginRoot, 'commands', 'gems.mjs'), join(dir, 'commands', 'gems.mjs'), { recursive: true });
  cpSync(join(pluginRoot, 'lib'), join(dir, 'lib'), {
    recursive: true,
    filter: (src) => !src.endsWith('.test.ts'),
  });

  // The generated skill file itself (e.g. SKILL.md), rendered fresh so an install never lays down
  // a stale artifact even if `dist/` was not regenerated.
  const skillName = host.outFile.split('/').pop();
  writeFileSync(join(dir, skillName), render(hostId));

  return { host: hostId, dir, files: ['commands/gems.mjs', 'lib/', skillName] };
}

/**
 * Install into the named hosts, or into every detected CLI when `only` is null.
 * `only` may be a single host id or "all".
 * @param {{ only?: string | null, env?: Record<string, string | undefined>, pluginRoot?: string }} [opts]
 */
export function install({ only = null, env = process.env, pluginRoot = PLUGIN_ROOT } = {}) {
  let targets;
  if (only && only !== 'all') targets = [only];
  else if (only === 'all') targets = hostIds();
  else targets = detectHosts(env);
  return targets.map((id) => installHost(id, { env, pluginRoot }));
}

export { PLUGIN_ROOT };
