import Link from 'next/link';
import { LINKS } from './constants';

export function LandingHero() {
  return (
    <section className="relative w-full flex flex-col lg:flex-row min-h-[70vh] bg-canvas">
      <div className="flex-1 flex flex-col justify-center px-8 py-16 lg:px-24">
        <h1 className="font-display text-5xl lg:text-7xl leading-[1.05] tracking-tight text-ink mb-6 max-w-2xl">
          Your builder journey,
          <br />
          captured automatically.
        </h1>
        <p className="text-lg text-ink-tint mb-10 max-w-xl leading-relaxed">
          Not what you shipped. How you got better. Gems turns how you build with Claude Code into a
          shareable record of evidence — not hype.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <a
            href={LINKS.install}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex justify-center items-center bg-primary hover:bg-primary-deep text-on-primary font-medium px-6 py-3 rounded-md transition-colors h-11"
          >
            Install Plugin
          </a>
          <Link
            href={LINKS.demoProfile}
            className="inline-flex justify-center items-center bg-canvas text-ink font-medium border border-beige-deep px-6 py-3 rounded-md hover:bg-surface transition-colors h-11"
          >
            View demo profile
          </Link>
        </div>

        <p className="text-sm text-ink-tint">
          Already published?{' '}
          <Link href={LINKS.demoProfile} className="text-primary hover:underline font-medium">
            View profile
          </Link>
        </p>
      </div>

      <div className="flex-1 relative hidden lg:block overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sunshine-500 via-primary to-primary-deep" />
        <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-ink/20 to-transparent" />
      </div>
    </section>
  );
}
