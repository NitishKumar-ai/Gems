import { CopyCommand } from './CopyCommand';
import { INSTALL_COMMANDS } from './constants';

const STEPS = [
  {
    number: '1',
    title: 'Install the plugin',
    description:
      'Add the Gems marketplace and install into Claude Code. One command — then every session is captured when it ends.',
  },
  {
    number: '2',
    title: 'Build as you already do',
    description:
      'No new workflow. Gems reads session transcripts locally and derives metrics — evidence-before-edit, steering, tool failures, evolution.',
  },
  {
    number: '3',
    title: 'Publish your journey',
    description:
      'Run /gems publish when you are ready. A redacted artifact lands on your public profile — metrics and achievements, never raw transcripts.',
  },
] as const;

export function HowItWorks() {
  return (
    <section className="w-full px-8 lg:px-24 py-24 bg-canvas">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-display text-4xl text-ink mb-4 tracking-tight">How it works</h2>
        <p className="text-lg text-ink-tint mb-12 max-w-2xl">
          Install once. Build normally. Your journey accumulates in the background.
        </p>

        <div className="space-y-10 mb-12">
          {STEPS.map((step) => (
            <div key={step.number} className="flex gap-6">
              <span className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-primary text-on-primary font-display font-bold text-lg">
                {step.number}
              </span>
              <div>
                <h3 className="font-semibold text-xl text-ink mb-2">{step.title}</h3>
                <p className="text-ink-tint leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-ink-tint uppercase tracking-widest">Install command</p>
          {INSTALL_COMMANDS.map((command) => (
            <CopyCommand key={command} command={command} />
          ))}
        </div>
      </div>
    </section>
  );
}
