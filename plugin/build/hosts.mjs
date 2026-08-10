// Per-CLI host configuration for the Gems command generator.
//
// One template (`../skill/gems.tmpl.md`) is authored once; each host here declares how that
// template becomes the CLI's native command/skill file: the frontmatter shape, how the command
// invokes the shared Node engine, where the file lands in the generated `dist/` tree, and where
// `gems install` copies it into the user's home. Adding a CLI is a new entry in `HOSTS` — the
// generator and installer stay untouched.
//
// This is the same "author once, fan out per host" pattern gstack uses (see
// `vendor/gstack/scripts/host-config.ts`), narrowed to what Gems needs: a command that shells
// out to `gems.mjs`.

import { homedir } from 'node:os';
import { join } from 'node:path';

export const HEADER =
  '<!-- AUTO-GENERATED from skill/gems.tmpl.md — do not edit. Regenerate: bun run gen:plugin -->';

// Literal so the generated Claude frontmatter reproduces the hand-authored plugin byte-for-byte.
const CLAUDE_PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}';

/**
 * Claude Code — the canonical plugin at `plugin/commands/gems.md` is hand-authored and shipped;
 * this generated copy mirrors it (a test asserts they match, minus the header) so the template
 * can never silently drift from what Claude installs. Claude installs via the plugin marketplace,
 * not `gems install`, so `installDir` is null.
 */
const claudeCode = {
  id: 'claude-code',
  outFile: 'commands/gems.md',
  installDir: null,
  frontmatter: (f) =>
    [
      `description: ${JSON.stringify(f.description)}`,
      `argument-hint: ${JSON.stringify(f.argumentHint)}`,
      'allowed-tools: ["Bash(node \\"${CLAUDE_PLUGIN_ROOT}/commands/gems.mjs\\":*)"]',
    ].join('\n'),
  run: [
    'Read the local journey and print it:',
    '',
    '```!',
    `node "${CLAUDE_PLUGIN_ROOT}/commands/gems.mjs" $ARGUMENTS`,
    '```',
  ].join('\n'),
};

/**
 * Codex — a skill is a `SKILL.md` under `~/.codex/skills/gems/`, frontmatter limited to
 * `{name, description}` with a 1024-char description ceiling. No lifecycle hook, so the skill
 * itself runs `gems capture` first (capture-on-invoke); the engine root is `$GEMS_ROOT`, set by
 * the installer's copy layout.
 */
const codex = {
  id: 'codex',
  outFile: 'skills/gems/SKILL.md',
  descriptionLimit: 1024,
  engineRootEnv: 'GEMS_ROOT',
  installDir: (env = process.env) => join(env.HOME || homedir(), '.codex', 'skills', 'gems'),
  frontmatter: (f) => [`name: ${f.name}`, `description: ${JSON.stringify(f.description)}`].join('\n'),
  run: [
    'Run these with your shell tool. The first captures any new sessions from every CLI — Gems',
    'reads transcripts off disk, so capture works without a session-end hook — and the second',
    'renders the journey:',
    '',
    '    GEMS_ROOT="$HOME/.codex/skills/gems"',
    '    node "$GEMS_ROOT/commands/gems.mjs" capture',
    '    node "$GEMS_ROOT/commands/gems.mjs"',
    '',
    'To publish to your public profile, run `node "$GEMS_ROOT/commands/gems.mjs" publish` in place',
    'of the second command.',
  ].join('\n'),
};

export const HOSTS = { 'claude-code': claudeCode, codex };

export function hostIds() {
  return Object.keys(HOSTS);
}
