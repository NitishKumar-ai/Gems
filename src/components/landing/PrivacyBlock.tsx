export function PrivacyBlock() {
  return (
    <section className="w-full px-8 lg:px-24 py-24 bg-canvas">
      <div className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cream border border-beige-deep mb-6">
          <svg
            className="w-6 h-6 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>
        <h2 className="font-display text-3xl lg:text-4xl text-ink mb-6 tracking-tight">
          Your transcripts never leave your machine.
        </h2>
        <p className="text-lg text-ink-tint leading-relaxed max-w-2xl mx-auto">
          Gems captures sessions locally. Metrics are derived on your machine. Publishing sends only a
          redacted artifact — never raw conversation history. Privacy is not a footnote; it is how the
          product works.
        </p>
      </div>
    </section>
  );
}
