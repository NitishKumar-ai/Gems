export const LINKS = {
  github: 'https://github.com/NitishKumar-ai/Gems',
  install: 'https://github.com/NitishKumar-ai/Gems#install',
  pluginReadme: 'https://github.com/NitishKumar-ai/Gems/tree/main/plugin',
  // The landing page's secondary CTA has to land on a journey that actually exists in whatever
  // database is behind it. Production points at the maintainer's published profile; the E2E suite
  // overrides this to its own seeded fixture so the specs stay independent of any real handle.
  demoProfile: process.env.NEXT_PUBLIC_GEMS_DEMO_PROFILE ?? '/NitishKumar-ai/Gems',
  dashboard: '/dashboard',
} as const;

export const INSTALL_COMMANDS = [
  '/plugin marketplace add NitishKumar-ai/Gems',
  '/plugin install gems@gems',
] as const;
