import Anthropic from '@anthropic-ai/sdk';

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
    dimensions: Record<string, { locked: true } | { locked: false; value: number; evidence: string }>;
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
 * Projects the full published `metrics` JSON (plugin/lib/journey.mjs's buildJourney() output)
 * down to the aggregate-only subset the model is allowed to see. Deliberately drops
 * `replay_events` and anything not already a count/rate/evidence-string, so "never send raw
 * session content" is true by construction rather than by policy.
 */
export function buildAnalysisInput(repo: string, metrics: any): AnalysisInput {
  const totals = metrics?.totals ?? {};
  const rates = totals.rates ?? {};
  const achievements = metrics?.achievements ?? {};
  const rubric = metrics?.rubric ?? {};

  const dimensions: AnalysisInput['rubric']['dimensions'] = {};
  for (const [id, dim] of Object.entries<any>(rubric.dimensions ?? {})) {
    dimensions[id] = dim?.locked
      ? { locked: true }
      : { locked: false, value: dim.value, evidence: dim.evidence ?? '' };
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
      earned: (achievements.earned ?? []).map((b: any) => ({
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
