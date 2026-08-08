const METRICS = [
  {
    title: 'Evidence-Before-Edit',
    description:
      'Do you read and test before changing code, or edit blind? Tracked across every session — the habit that separates understanding from shipping.',
  },
  {
    title: 'Steering',
    description:
      'How often you stop and redirect the agent instead of letting it run. A measure of active collaboration, not passive acceptance.',
  },
  {
    title: 'Invalid Action Rate',
    description:
      'Failed tool calls and retries as a share of total work. Execution hygiene over time — not a single bad day, but a trend.',
  },
  {
    title: 'Evolution',
    description:
      'All of the above, plotted longitudinally. Six weeks ago you edited before reading; now you read first 90% of the time. That is the story.',
  },
] as const;

export function MetricsExplainer() {
  return (
    <section className="w-full px-8 lg:px-24 py-24 bg-surface">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display text-4xl text-ink mb-4 tracking-tight">What gets measured</h2>
        <p className="text-lg text-ink-tint mb-12 max-w-2xl">
          All derived from your session transcripts. None of it self-reported. Earned from evidence,
          never granted for showing up.
        </p>

        <div className="grid sm:grid-cols-2 gap-6">
          {METRICS.map((metric) => (
            <article
              key={metric.title}
              className="bg-cream border border-beige-deep rounded-lg p-8 flex flex-col gap-3"
            >
              <h3 className="font-display text-2xl text-ink">{metric.title}</h3>
              <p className="text-ink-tint leading-relaxed text-base">{metric.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
