export function ProblemContrast() {
  return (
    <section className="w-full px-8 lg:px-24 py-24 bg-surface">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-display text-4xl lg:text-5xl text-ink mb-8 tracking-tight">
          GitHub shows commits.
          <br />
          Gems shows evolution.
        </h2>
        <div className="grid md:grid-cols-2 gap-8 mt-12">
          <div className="bg-canvas border border-hairline-soft rounded-lg p-8">
            <h3 className="font-semibold text-xs uppercase tracking-widest text-ink-tint mb-4">
              What GitHub sees
            </h3>
            <ul className="space-y-3 text-ink-tint text-base leading-relaxed">
              <li>Final diffs and commit messages</li>
              <li>When code landed, not how you decided</li>
              <li>A snapshot with no before-and-after</li>
            </ul>
          </div>
          <div className="bg-cream border border-beige-deep rounded-lg p-8">
            <h3 className="font-semibold text-xs uppercase tracking-widest text-primary mb-4">
              What Gems captures
            </h3>
            <ul className="space-y-3 text-ink text-base leading-relaxed">
              <li>Evidence-before-edit habits over weeks</li>
              <li>How you steer the agent when it drifts</li>
              <li>Longitudinal deltas — your actual journey</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
