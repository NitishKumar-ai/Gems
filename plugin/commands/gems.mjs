#!/usr/bin/env node
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readStore, buildJourney } from '../lib/journey.mjs';

const home = process.env.GEMS_HOME || join(homedir(), '.gems');
const storePath = join(home, 'sessions.jsonl');

try {
  const { records, corrupt } = readStore(storePath);
  const journey = buildJourney(records);
  
  console.log('\n💎 Your Builder Journey 💎\n');
  
  if (journey.totals.sessions === 0) {
    console.log('No sessions captured yet. Start a session in Claude Code and exit to see your stats!');
    process.exit(0);
  }

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
    // Turns per prompt doesn't map directly to percentages neatly, so we'll just show raw diff
    console.log(`Turns per prompt:     ${journey.trend.delta.turns_per_prompt === null ? 'N/A' : (journey.trend.delta.turns_per_prompt > 0 ? '+' : '') + journey.trend.delta.turns_per_prompt.toFixed(2)}`);
  } else {
    console.log(`Trend unavailable: ${journey.trend_unavailable_reason}`);
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
} catch (err) {
  console.error('Failed to read journey:', err.message);
}
