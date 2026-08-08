import Link from 'next/link';
import { LINKS } from './constants';

export function FinalCta() {
  return (
    <section className="w-full px-8 lg:px-24 py-24 bg-cream">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display text-4xl text-ink mb-6 tracking-tight">
          Start capturing your builder journey.
        </h2>
        <p className="text-lg text-ink-tint mb-10 leading-relaxed">
          Install the plugin, build as you already do, and let the evidence accumulate. When you are
          ready, publish a profile that shows how you got better — not just what you shipped.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={LINKS.install}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex justify-center items-center bg-primary hover:bg-primary-deep text-on-primary font-medium px-8 py-3 rounded-md transition-colors"
          >
            Install Plugin
          </a>
          <Link
            href={LINKS.dashboard}
            className="inline-flex justify-center items-center bg-canvas text-ink font-medium border border-beige-deep px-8 py-3 rounded-md hover:bg-surface transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
