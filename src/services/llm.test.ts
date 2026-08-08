import { expect, test, describe } from 'bun:test';
import Anthropic from '@anthropic-ai/sdk';

import { buildAnalysisInput, analyzeJourney } from './llm';

describe('buildAnalysisInput', () => {
  test('projects a full metrics object into the expected AnalysisInput shape', () => {
    const metrics = {
      totals: {
        sessions: 16,
        edits: 192,
        informed_edits: 152,
        tool_calls: 600,
        tool_failures: 0,
        interrupts: 32,
        prompts: 64,
        duration_ms: 9_600_000,
        models: { 'claude-opus-5': 9, 'claude-sonnet-5': 2 },
        tools: { Read: 20, Edit: 15 },
        rates: {
          evidence_before_edit: 0.792,
          invalid_action: 0,
          turns_per_prompt: 1.8,
          steering_rate_event: 0.5,
        },
      },
      trend: {
        delta: {
          evidence_before_edit: 0.15,
          invalid_action: 0,
          steering_rate_event: 0,
        },
      },
      achievements: {
        qualifying_sessions: 16,
        earned: [
          {
            id: 'first-light',
            title: 'First Light',
            description: 'Captured a first session with real work in it.',
            basis: 'milestone' as const,
            earned_at: '2026-06-01T00:00:00.000Z',
            evidence: '1st session',
          },
        ],
        locked: [
          {
            id: 'long-haul',
            title: 'Long Haul',
            description: 'Did real work on 14 separate days.',
            basis: 'consistency' as const,
            earned_at: null,
          },
        ],
      },
      rubric: {
        qualifying_sessions: 16,
        dimensions: {
          'evidence-discipline': { locked: false, value: 0.792, evidence: '152/192 edits informed' },
          'prompt-craft': { locked: true },
          'learning-velocity': {
            locked: false,
            direction: 'flat',
            directions: { evidence_before_edit: 'improved', invalid_action: 'flat', steering_rate_event: 'flat' },
          },
        },
      },
    };

    const input = buildAnalysisInput('testuser/testrepo', metrics);

    expect(input.repo).toBe('testuser/testrepo');
    expect(input.totals.sessions).toBe(16);
    expect(input.totals.edits).toBe(192);
    expect(input.totals.informed_edits).toBe(152);
    expect(input.totals.tool_calls).toBe(600);
    expect(input.totals.models).toEqual({ 'claude-opus-5': 9, 'claude-sonnet-5': 2 });
    expect(input.totals.rates.evidence_before_edit).toBe(0.792);
    expect(input.totals.rates.turns_per_prompt).toBe(1.8);

    expect(input.trend).toEqual({ delta: { evidence_before_edit: 0.15, invalid_action: 0, steering_rate_event: 0 } });

    expect(input.achievements.qualifying_sessions).toBe(16);
    expect(input.achievements.earned).toEqual([
      { id: 'first-light', title: 'First Light', basis: 'milestone', evidence: '1st session' },
    ]);
    // locked_count is derived from the *length* of achievements.locked, not the array itself.
    expect(input.achievements.locked_count).toBe(1);

    expect(input.rubric.qualifying_sessions).toBe(16);
    // Regression: the model previously received a bare `value` field for every dimension, with
    // no way to tell a raw rate/delta from the 0-10 score shown on the page — it produced text
    // like "prompt-craft scored 0" when the raw delta was 0 but the displayed score was 5.0/10.
    // A scored dimension must carry both, explicitly labeled.
    expect(input.rubric.dimensions['evidence-discipline']).toEqual({
      locked: false,
      score: 9.9,
      raw_value: 0.792,
      evidence: '152/192 edits informed',
    });
    // A locked dimension must never leak a `value`/`evidence` field, even if present upstream.
    expect(input.rubric.dimensions['prompt-craft']).toEqual({ locked: true });
    // learning-velocity has no 0-10 score at all — it's a direction verdict, not a scored
    // dimension, and must never be squeezed into the {score, raw_value, evidence} shape.
    expect(input.rubric.dimensions['learning-velocity']).toEqual({
      locked: false,
      direction: 'flat',
      directions: { evidence_before_edit: 'improved', invalid_action: 'flat', steering_rate_event: 'flat' },
    });
  });

  test('a metrics object missing every nested field produces safe defaults without throwing', () => {
    expect(() => buildAnalysisInput('empty/repo', {})).not.toThrow();

    const input = buildAnalysisInput('empty/repo', {});

    expect(input.repo).toBe('empty/repo');
    expect(input.totals).toEqual({
      sessions: 0,
      edits: 0,
      informed_edits: 0,
      tool_calls: 0,
      tool_failures: 0,
      interrupts: 0,
      prompts: 0,
      duration_ms: 0,
      models: {},
      tools: {},
      rates: {
        evidence_before_edit: null,
        invalid_action: null,
        turns_per_prompt: null,
        steering_rate_event: null,
      },
    });
    expect(input.trend).toBeNull();
    expect(input.achievements).toEqual({ qualifying_sessions: 0, earned: [], locked_count: 0 });
    expect(input.rubric).toEqual({ qualifying_sessions: 0, dimensions: {} });
  });

  test('undefined/null metrics (no `totals`, no `rates`, no `trend`, empty `achievements.earned`) never throws and yields the same safe defaults', () => {
    const metrics = {
      totals: { sessions: 3, edits: 4 }, // no `rates` key at all
      achievements: { earned: [] }, // present but empty, no `locked`
      // no `trend`, no `rubric`
    };

    expect(() => buildAnalysisInput('partial/repo', metrics)).not.toThrow();

    const input = buildAnalysisInput('partial/repo', metrics);

    expect(input.totals.sessions).toBe(3);
    expect(input.totals.edits).toBe(4);
    expect(input.totals.rates).toEqual({
      evidence_before_edit: null,
      invalid_action: null,
      turns_per_prompt: null,
      steering_rate_event: null,
    });
    expect(input.trend).toBeNull();
    expect(input.achievements.earned).toEqual([]);
    expect(input.achievements.locked_count).toBe(0);
    expect(input.rubric).toEqual({ qualifying_sessions: 0, dimensions: {} });
  });

  test('a fully null/undefined `metrics` argument does not throw', () => {
    expect(() => buildAnalysisInput('null-repo', null)).not.toThrow();
    expect(() => buildAnalysisInput('undef-repo', undefined)).not.toThrow();

    const input = buildAnalysisInput('null-repo', null);
    expect(input.totals.sessions).toBe(0);
    expect(input.achievements.earned).toEqual([]);
    expect(input.rubric.dimensions).toEqual({});
  });
});

describe('analyzeJourney', () => {
  test('resolves to null without making a network call when ANTHROPIC_API_KEY is unset', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const input = buildAnalysisInput('no-key/repo', {});
      const result = await analyzeJourney(input);
      expect(result).toBeNull();
    } finally {
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });

  test('resolves to null (not a throw) when the key is set but the API call itself fails', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-mocked-failure-path';

    // Patch Messages.prototype.create so this exercises analyzeJourney's catch(error) -> null
    // path deterministically, with no real network call to Anthropic (never make live API
    // assertions from a unit test — too slow/costly/flaky).
    const probe = new Anthropic({ apiKey: 'x' });
    const messagesProto = Object.getPrototypeOf(probe.messages) as { create: (...args: unknown[]) => unknown };
    const originalCreate = messagesProto.create;
    messagesProto.create = async () => {
      throw new Error('simulated network failure');
    };

    try {
      const input = buildAnalysisInput('bad-key/repo', {});
      const result = await analyzeJourney(input);
      expect(result).toBeNull();
    } finally {
      messagesProto.create = originalCreate;
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });

  test('resolves to null when the model returns no tool_use block (malformed response, not thrown)', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-mocked-malformed-path';

    const probe = new Anthropic({ apiKey: 'x' });
    const messagesProto = Object.getPrototypeOf(probe.messages) as { create: (...args: unknown[]) => unknown };
    const originalCreate = messagesProto.create;
    messagesProto.create = async () => ({
      stop_reason: 'end_turn',
      model: 'claude-opus-5',
      content: [{ type: 'text', text: 'no tool use here' }],
    });

    try {
      const input = buildAnalysisInput('malformed/repo', {});
      const result = await analyzeJourney(input);
      expect(result).toBeNull();
    } finally {
      messagesProto.create = originalCreate;
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });

  test('resolves to null when the model refuses (stop_reason "refusal"), not thrown', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-mocked-refusal-path';

    const probe = new Anthropic({ apiKey: 'x' });
    const messagesProto = Object.getPrototypeOf(probe.messages) as { create: (...args: unknown[]) => unknown };
    const originalCreate = messagesProto.create;
    messagesProto.create = async () => ({
      stop_reason: 'refusal',
      model: 'claude-opus-5',
      content: [],
    });

    try {
      const input = buildAnalysisInput('refused/repo', {});
      const result = await analyzeJourney(input);
      expect(result).toBeNull();
    } finally {
      messagesProto.create = originalCreate;
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });

  test('projects a well-formed tool_use response into an AnalysisResult with schema/generated_at/model attached', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-mocked-success-path';

    const probe = new Anthropic({ apiKey: 'x' });
    const messagesProto = Object.getPrototypeOf(probe.messages) as { create: (...args: unknown[]) => unknown };
    const originalCreate = messagesProto.create;
    const fakeParsed = {
      archetype: { name: 'The Architect', rationale: 'High evidence discipline.' },
      headline: 'A disciplined session.',
      summary: 'Summary text.',
      insights: [{ label: 'Evidence Discipline', detail: '79% informed edits.' }],
      growth_edge: { title: 'Tighten steering', detail: 'Reduce interrupts.' },
    };
    messagesProto.create = async () => ({
      stop_reason: 'tool_use',
      model: 'claude-opus-5',
      content: [{ type: 'tool_use', name: 'emit_builder_report', id: 'toolu_1', input: fakeParsed }],
    });

    try {
      const input = buildAnalysisInput('ok/repo', {});
      const result = await analyzeJourney(input);
      expect(result).not.toBeNull();
      expect(result!.schema).toBe(1);
      expect(result!.model).toBe('claude-opus-5');
      expect(typeof result!.generated_at).toBe('string');
      expect(result!.archetype).toEqual(fakeParsed.archetype);
      expect(result!.growth_edge).toEqual(fakeParsed.growth_edge);
    } finally {
      messagesProto.create = originalCreate;
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });
});
