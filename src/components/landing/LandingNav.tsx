import Link from 'next/link';
import { LINKS } from './constants';

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-canvas border-b border-hairline-soft">
      <Link href="/" className="font-display font-bold text-xl tracking-tight hover:opacity-80 transition-opacity">
        Gems_
      </Link>
      <div className="flex items-center gap-4">
        <Link href={LINKS.dashboard} className="text-sm font-medium hover:text-primary transition-colors">
          Dashboard
        </Link>
        <a
          href={LINKS.install}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-ink text-on-primary font-medium text-sm px-5 py-2.5 rounded-md hover:bg-ink-tint transition-colors"
        >
          Install Plugin
        </a>
      </div>
    </nav>
  );
}
