import Anthropic from '@anthropic-ai/sdk';
import { scoreFor, SCORED_DIMENSIONS, type ScoredDimensionId } from '@/lib/rubric';
// Type-only, so it is erased at build and pulls no client component into this server module.
// Reused rather than redeclared so the badge shape can't drift between the two.
import type { Achievement } from '@/components/Achievements';

/**
 * Gems — Anthropic-powered builder analysis.
 *
 * Turns the redacted metrics blob already computed by plugin/lib/journey.mjs into a narrative
 * archetype + growth-edge recommendation. Mirrors the house rule that runs through the rest of
 * this codebase (achievements.mjs, rubric.mjs): never fabricate a claim from insufficient data.
 * Concretely that means:
 *   - AnalysisInput is a narrow, versioned projection of `metrics` — aggregate counts/rates only,
 *     never `replay_events` or anything resembling raw session content.
 *   - The model is instructed to ground every insight in a field actually present in the input.
 *   - Any failure (no API key, network, malformed response) resolves to `null`, never a fallback
 *     or invented result — the same "locked, not fabricated" contract as a rubric dimension with
 *     insufficient data.
 */

export type AnalysisInput = {
  repo: string;
  totals: {
    sessions: number;
    edits: number;
    informed_edits: number;
    tool_calls: number;
    tool_failures: number;
    interrupts: number;
    prompts: number;
    duration_ms: number;
    models: Record<string, number>;
    tools: Record<string, number>;
    rates: {
      evidence_before_edit: number | null;
      invalid_action: number | null;
      turns_per_prompt: number | null;
      steering_rate_event: number | null;
    };
  };
  trend: null | {
    delta: {
      evidence_before_edit: number | null;
      invalid_action: number | null;
      steering_rate_event: number | null;
    };
  };
  achievements: {
    qualifying_sessions: number;
    earned: { id: string; title: string; basis: string; evidence?: string }[];
    locked_count: number;
  };
  rubric: {
    qualifying_sessions: number;
    // evidence-discipline, prompt-craft, execution-hygiene carry a computed 0-10 `score` (the
    // same number RubricCard renders) alongside the `raw_value` it was interpolated from — a
    // rate for evidence-discipline, a trend delta for the other two. learning-velocity has no
    // 0-10 score at all; it's a direction verdict. Handing the model an ambiguous bare `value`
    // here previously produced text like "prompt-craft scored 0" when the raw delta was 0 but
    // the displayed score was 5.0/10 — the model had no way to tell a delta from a score.
    dimensions: Record<
      string,
      | { locked: true }
      | { locked: false; score: number; raw_value: number; evidence: string }
      | { locked: false; direction: string; directions: Record<string, string | null> }
    >;
  };
};

export type AnalysisResult = {
  schema: 1;
  generated_at: string;
  model: string;
  archetype: { name: string; rationale: string };
  headline: string;
  summary: string;
  insights: { label: string; detail: string }[];
  growth_edge: { title: string; detail: string };
};

/**
 * The parsed `metrics` JSON as it arrives from the database — plugin/lib/journey.mjs's
 * buildJourney() output, which crosses a JSON.parse boundary and so carries no types of its own.
 * Declared as a partial mirror of what the projection below actually reads rather than `any`:
 * every field is optional because an older published profile may predate any of them, and
 * anything absent from this type (`replay_events`, per-session detail) stays unreachable.
 */
export type RawRates = {
  evidence_before_edit?: number | null;
  invalid_action?: number | null;
  turns_per_prompt?: number | null;
  steering_rate_event?: number | null;
};

export type RawDimension = {
  locked?: boolean;
  value?: number;
  evidence?: string;
  direction?: string;
  directions?: Record<string, string | null>;
};

export type JourneyMetrics = {
  totals?: {
    sessions?: number;
    edits?: number;
    informed_edits?: number;
    tool_calls?: number;
    tool_failures?: number;
    interrupts?: number;
    prompts?: number;
    duration_ms?: number;
    models?: Record<string, number>;
    tools?: Record<string, number>;
    rates?: RawRates;
  };
  trend?: {
    delta?: {
      evidence_before_edit?: number | null;
      invalid_action?: number | null;
      steering_rate_event?: number | null;
    };
  } | null;
  achievements?: {
    qualifying_sessions?: number;
    earned?: Achievement[];
    locked?: Achievement[];
  };
  rubric?: {
    qualifying_sessions?: number;
    dimensions?: Record<string, RawDimension>;
  };
};

/**
 * Projects the full published `metrics` JSON (plugin/lib/journey.mjs's buildJourney() output)
 * down to the aggregate-only subset the model is allowed to see. Deliberately drops
 * `replay_events` and anything not already a count/rate/evidence-string, so "never send raw
 * session content" is true by construction rather than by policy.
 */
export function buildAnalysisInput(repo: string, metrics: JourneyMetrics | null | undefined): AnalysisInput {
  const totals: NonNullable<JourneyMetrics['totals']> = metrics?.totals ?? {};
  const rates: RawRates = totals.rates ?? {};
  const achievements: NonNullable<JourneyMetrics['achievements']> = metrics?.achievements ?? {};
  const rubric: NonNullable<JourneyMetrics['rubric']> = metrics?.rubric ?? {};

  const dimensions: AnalysisInput['rubric']['dimensions'] = {};
  for (const [id, dim] of Object.entries(rubric.dimensions ?? {})) {
    if (dim?.locked) {
      dimensions[id] = { locked: true };
    } else if ((SCORED_DIMENSIONS as readonly string[]).includes(id)) {
      // An unlocked scored dimension always carries a numeric `value` (plugin/lib/rubric.mjs
      // only omits it by locking). The fallback satisfies the type; it is not a real state.
      const value = dim.value ?? 0;
      dimensions[id] = {
        locked: false,
        score: scoreFor(id as ScoredDimensionId, value),
        raw_value: value,
        evidence: dim.evidence ?? '',
      };
    } else {
      // learning-velocity: a direction verdict (improved/declined/flat/mixed), not a 0-10 score.
      // rubric.mjs's majority vote always yields a string here, falling back to 'mixed' itself.
      dimensions[id] = {
        locked: false,
        direction: dim.direction ?? 'mixed',
        directions: dim.directions ?? {},
      };
    }
  }

  return {
    repo,
    totals: {
      sessions: totals.sessions ?? 0,
      edits: totals.edits ?? 0,
      informed_edits: totals.informed_edits ?? 0,
      tool_calls: totals.tool_calls ?? 0,
      tool_failures: totals.tool_failures ?? 0,
      interrupts: totals.interrupts ?? 0,
      prompts: totals.prompts ?? 0,
      duration_ms: totals.duration_ms ?? 0,
      models: totals.models ?? {},
      tools: totals.tools ?? {},
      rates: {
        evidence_before_edit: rates.evidence_before_edit ?? null,
        invalid_action: rates.invalid_action ?? null,
        turns_per_prompt: rates.turns_per_prompt ?? null,
        steering_rate_event: rates.steering_rate_event ?? null,
      },
    },
    trend: metrics?.trend
      ? {
          delta: {
            evidence_before_edit: metrics.trend.delta?.evidence_before_edit ?? null,
            invalid_action: metrics.trend.delta?.invalid_action ?? null,
            steering_rate_event: metrics.trend.delta?.steering_rate_event ?? null,
          },
        }
      : null,
    achievements: {
      qualifying_sessions: achievements.qualifying_sessions ?? 0,
      earned: (achievements.earned ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        basis: b.basis,
        evidence: b.evidence,
      })),
      locked_count: (achievements.locked ?? []).length,
    },
    rubric: {
      qualifying_sessions: rubric.qualifying_sessions ?? 0,
      dimensions,
    },
  };
}

const SYSTEM_PROMPT = `You are analyzing a software developer's AI-assisted coding session metrics to produce a short, celebratory "builder report" — the same kind of narrative recap Spotify Wrapped gives listeners, but grounded in real numbers instead of vibes.

You will be given only aggregate counts, rates, and evidence strings already computed from a developer's coding sessions. Never state a number that is not present in the input. Every insight must cite the specific field it is grounded in. Do not invent achievements, rates, or trends beyond what is given. If a dimension is locked or a rate is null, do not speculate about what it might be.

For each scored rubric dimension (evidence-discipline, prompt-craft, execution-hygiene), the input gives you two distinct numbers: \`score\` is the 0-10 rating shown on the page — always use this when you say a dimension "scored" something. \`raw_value\` is the underlying rate or trend delta \`score\` was computed from (e.g. a delta of 0 means "no change," not "scored 0") — cite it only to explain the score, never in place of it. learning-velocity has no score at all, only a \`direction\` verdict (improved/declined/flat/mixed) and a per-metric \`directions\` breakdown.

Write in a warm, direct, slightly playful voice — this is a shareable recap, not a performance review.`;

const EMIT_BUILDER_REPORT_TOOL: Anthropic.Tool = {
  name: 'emit_builder_report',
  description: 'Emit the structured builder report derived from the given metrics.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      archetype: {
        type: 'object',
        description: 'A short, evocative archetype classification for this builder.',
        properties: {
          name: { type: 'string', description: 'e.g. "The Architect", "The Night Owl" — 1-3 words.' },
          rationale: { type: 'string', description: 'One sentence grounding the archetype in a specific field from the input.' },
        },
        required: ['name', 'rationale'],
        additionalProperties: false,
      },
      headline: { type: 'string', description: 'One sentence, at most 140 characters, summarizing the session in a way backed by the input data.' },
      summary: { type: 'string', description: '2-4 sentences expanding on the headline.' },
      insights: {
        type: 'array',
        description: 'Provide 3 to 5 insights, each grounded in a specific field from the input.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short label for the insight, e.g. "Evidence Discipline".' },
            detail: { type: 'string', description: 'The insight itself, citing the specific metric it is grounded in.' },
          },
          required: ['label', 'detail'],
          additionalProperties: false,
        },
      },
      growth_edge: {
        type: 'object',
        description: 'One concrete, specific next step grounded in the input data.',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['title', 'detail'],
        additionalProperties: false,
      },
    },
    required: ['archetype', 'headline', 'summary', 'insights', 'growth_edge'],
    additionalProperties: false,
  },
};

/**
 * Best-effort. Never throws — a missing key, a network error, or a malformed model response all
 * resolve to `null`, which the caller treats exactly like any other "not enough data yet" state
 * already present on a Journey (an old profile has no achievements/rubric block either).
 */
export async function analyzeJourney(input: AnalysisInput): Promise<AnalysisResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[llm] ANTHROPIC_API_KEY not set — skipping analysis, publishing without it.');
    return null;
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      // Thinking is on by default on Opus 5, and max_tokens caps thinking + tool output
      // combined — 1024 was too tight and truncated the tool call before every required
      // field was emitted (observed via a smoke test: stop_reason "max_tokens", missing
      // growth_edge). Sized with headroom for adaptive thinking at "medium" effort.
      max_tokens: 4096,
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(input) }],
      tools: [EMIT_BUILDER_REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'emit_builder_report' },
    });

    if (response.stop_reason === 'refusal') {
      console.warn('[llm] Anthropic declined the analysis request — publishing without it.');
      return null;
    }

    const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!block) return null;

    const parsed = block.input as Omit<AnalysisResult, 'schema' | 'generated_at' | 'model'>;
    return {
      schema: 1,
      generated_at: new Date().toISOString(),
      model: response.model,
      ...parsed,
    };
  } catch (error) {
    console.error('[llm] Anthropic analysis failed — publishing without it:', error);
    return null;
  }
}
