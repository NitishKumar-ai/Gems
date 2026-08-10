#!/usr/bin/env node
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { readStore, buildJourney } from '../lib/journey.mjs';
import { captureAll } from '../lib/capture.mjs';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';

const args = process.argv.slice(2);
const isPublish = args.includes('publish') || args.includes('--publish');
const isLogin = args[0] === 'login';
const isCapture = args[0] === 'capture';
const isInstall = args[0] === 'install';

const home = process.env.GEMS_HOME || join(homedir(), '.gems');
const storePath = join(home, 'sessions.jsonl');
const configPath = join(home, 'config.json');

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return {};
  }
}

function saveConfig(config) {
  if (!fs.existsSync(home)) {
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

async function publishJourney(journey) {
  const config = getConfig();
  const apiKey = process.env.GEMS_API_KEY || config.GEMS_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMS_API_KEY environment variable is required to publish.');
    process.exit(1);
  }

  // The server publishes under the GitHub handle bound to this API key and ignores any handle
  // sent from here, so asking for one is at best redundant and at worst a lie about who decides.
  // Still read, still sent, purely so an explicit mismatch comes back as a 403 naming the real
  // handle rather than quietly landing somewhere the caller did not name.
  let username = process.env.GEMS_USERNAME;
  const userIdx = args.indexOf('--username');
  if (userIdx !== -1 && args[userIdx + 1]) {
    username = args[userIdx + 1];
  }

  const repo = basename(process.cwd());
  const host = process.env.GEMS_HOST || 'https://gems.inmodel.in';
  const url = `${host}/api/publish`;

  console.log(`Publishing ${repo} to ${host}...`);

  const payload = JSON.stringify({
    ...(username ? { username } : {}),
    repo,
    metrics: journey,
  });

  const req = (host.startsWith('https') ? https : http).request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(payload),
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const json = JSON.parse(data);
          console.log(`✅ Successfully published! View it at: ${host}${json.url}`);
        } catch {
          console.log(`✅ Successfully published! (Status: ${res.statusCode})`);
        }
      } else {
        // The server's `error` string is the actionable part — which handle you actually own, or
        // that you need to sign in again. Falling back to the raw body keeps an unexpected
        // response (an HTML error page from a proxy, say) visible rather than swallowed.
        let detail = data;
        try {
          detail = JSON.parse(data).error ?? data;
        } catch {
          /* not JSON — show it as it arrived */
        }
        console.error(`❌ Failed to publish (HTTP ${res.statusCode}): ${detail}`);
        process.exitCode = 1;
      }
    });
  });

  req.on('error', (e) => {
    console.error('❌ Failed to publish: Network error:', e.message);
    process.exitCode = 1;
  });

  req.write(payload);
  req.end();
}

// `capture` scans every CLI's transcript directory and records whatever is new. It is what the
// generated skills run before rendering, so a CLI with no session-end hook still accumulates a
// journey. Idempotent, so running it on every `/gems` invoke is safe.
if (isCapture) {
  const res = await captureAll();
  const perSource = Object.entries(res.sources)
    .map(([source, n]) => `${n} ${source}`)
    .join(', ');
  console.log(
    `Gems: captured ${res.captured} new session(s)${perSource ? ` (${perSource})` : ''}; ${res.skipped} already recorded.`,
  );
  process.exit(0);
}

// `install [--host <cli>|all]` lays the generated skill + shared engine into a CLI's home. Loaded
// lazily because it lives under build/, which is present in the repo but not in an installed copy.
if (isInstall) {
  const { install } = await import('../build/install.mjs');
  const hostIdx = args.indexOf('--host');
  const only = hostIdx !== -1 ? args[hostIdx + 1] : null;
  const results = install({ only });
  if (results.length === 0) {
    console.log('Gems: no supported CLI detected. Pass --host <cli> to install anyway.');
  }
  for (const r of results) {
    if (r.skipped) console.log(`Gems: ${r.host} skipped — ${r.reason}.`);
    else console.log(`Gems: installed into ${r.host} at ${r.dir}`);
  }
  process.exit(0);
}

try {
  const { records, corrupt } = readStore(storePath);
  const journey = buildJourney(records);
  
  console.log('\n💎 Your Builder Journey 💎\n');
  
  if (journey.totals.sessions === 0) {
    console.log('No sessions captured yet. Start a session in Claude Code and exit to see your stats!');
    process.exit(0);
  }

  if (isLogin) {
    const apiKey = args[1];
    if (!apiKey) {
      console.error('Error: Please provide an API key. Usage: /gems login <API_KEY>');
      process.exit(1);
    }
    const config = getConfig();
    config.GEMS_API_KEY = apiKey;
    saveConfig(config);
    console.log('✅ API key saved successfully!');
    process.exit(0);
  }

  if (isPublish) {
    publishJourney(journey);
  } else {
    console.log(`Sessions captured: ${journey.totals.sessions}`);
    if (journey.totals.unextracted > 0) {
      console.log(`Unextracted sessions: ${journey.totals.unextracted}`);
    }
    if (corrupt > 0) {
      console.log(`Corrupt records skipped: ${corrupt}`);
    }

    const rates = journey.totals.rates;
    console.log('\n--- Totals & Rates ---');
    console.log(`Total edits: ${journey.totals.edits}`);
    console.log(`Evidence-Before-Edit rate: ${rates.evidence_before_edit !== null ? (rates.evidence_before_edit * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`Invalid Action rate: ${rates.invalid_action !== null ? (rates.invalid_action * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`Turns per prompt: ${rates.turns_per_prompt !== null ? rates.turns_per_prompt.toFixed(1) : 'N/A'}`);
    
    console.log('\n--- Evolution Deltas ---');
    if (journey.trend) {
      const renderDelta = (val) => val === null ? 'N/A' : `${val > 0 ? '+' : ''}${(val * 100).toFixed(1)}%`;
      console.log(`Evidence-Before-Edit: ${renderDelta(journey.trend.delta.evidence_before_edit)}`);
      console.log(`Invalid Action Rate:  ${renderDelta(journey.trend.delta.invalid_action)}`);
      console.log(`Turns per prompt:     ${journey.trend.delta.turns_per_prompt === null ? 'N/A' : (journey.trend.delta.turns_per_prompt > 0 ? '+' : '') + journey.trend.delta.turns_per_prompt.toFixed(2)}`);
    } else {
      console.log(`Trend unavailable: ${journey.trend_unavailable_reason}`);
    }

    console.log('\n--- Achievements ---');
    const { earned, locked, qualifying_sessions, ignored_sessions } = journey.achievements;
    if (earned.length > 0) {
      for (const badge of earned) {
        const when = badge.earned_at ? String(badge.earned_at).slice(0, 10) : '';
        console.log(`  🏆 ${badge.title} (${badge.basis})${badge.revocable ? ' — held, not banked' : ''}`);
        console.log(`     ${badge.evidence}${when ? ` · ${when}` : ''}`);
      }
    } else {
      console.log('  None yet.');
    }

    // The closest three, so the next one is visible rather than a mystery.
    const next = locked
      .filter((badge) => badge.progress)
      .sort((a, b) => b.progress.ratio - a.progress.ratio)
      .slice(0, 3);

    if (next.length > 0) {
      console.log('\n  Closest to earning:');
      for (const badge of next) {
        console.log(`     ${badge.title}: ${badge.progress.value}/${badge.progress.target} ${badge.progress.label}`);
      }
    }

    // Sessions too thin to count are stated rather than silently dropped, so the badge list
    // never looks like it lost history it simply refused to award anything for.
    if (ignored_sessions > 0) {
      console.log(`\n  Counting ${qualifying_sessions} sessions with real work; ${ignored_sessions} too thin to qualify.`);
    }

    console.log('\n--- Top Models ---');
    const models = Object.entries(journey.totals.models).slice(0, 5);
    if (models.length > 0) {
      for (const [model, turns] of models) {
        console.log(`  - ${model}: ${turns} turns`);
      }
    } else {
      console.log('  None');
    }

    console.log('\n--- Top Tools ---');
    const tools = Object.entries(journey.totals.tools).slice(0, 5);
    if (tools.length > 0) {
      for (const [tool, calls] of tools) {
        console.log(`  - ${tool}: ${calls} calls`);
      }
    } else {
      console.log('  None');
    }

    console.log();
  }
} catch (err) {
  console.error('Failed to read journey:', err.message);
}
