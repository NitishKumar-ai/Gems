import Link from 'next/link';
import { LINKS } from './constants';

export function LandingFooter() {
  return (
    <footer className="w-full bg-canvas border-t border-hairline-soft py-16 px-8 lg:px-24">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-12">
          <div>
            <span className="font-display font-bold text-xl tracking-tight text-ink">Gems_</span>
            <p className="text-sm text-ink-tint mt-3 max-w-xs leading-relaxed">
              A Claude Code plugin that turns how you build into a shareable builder journey.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:gap-16">
            <div>
              <h4 className="font-semibold text-xs uppercase tracking-widest mb-4 text-ink">Project</h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href={LINKS.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-sm hover:underline"
                  >
                    GitHub repo
                  </a>
                </li>
                <li>
                  <a
                    href={LINKS.pluginReadme}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-sm hover:underline"
                  >
                    Plugin README
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-xs uppercase tracking-widest mb-4 text-ink">Product</h4>
              <ul className="space-y-2">
                <li>
                  <Link href={LINKS.dashboard} className="text-primary text-sm hover:underline">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <a
                    href={LINKS.install}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-sm hover:underline"
                  >
                    Install Plugin
                  </a>
                </li>
                <li>
                  <Link href={LINKS.demoProfile} className="text-primary text-sm hover:underline">
                    Demo profile
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="text-xs text-ink-tint mt-12 pt-8 border-t border-hairline-soft">
          Built for builders who want evidence over hype.
        </p>
      </div>
    </footer>
  );
}
