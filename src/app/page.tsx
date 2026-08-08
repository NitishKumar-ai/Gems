import { FinalCta } from '@/components/landing/FinalCta';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingNav } from '@/components/landing/LandingNav';
import { MetricsExplainer } from '@/components/landing/MetricsExplainer';
import { PrivacyBlock } from '@/components/landing/PrivacyBlock';
import { ProblemContrast } from '@/components/landing/ProblemContrast';
import { PullQuoteDivider } from '@/components/landing/PullQuoteDivider';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col font-sans bg-canvas text-ink">
      <LandingNav />
      <LandingHero />
      <ProblemContrast />
      <HowItWorks />
      <MetricsExplainer />
      <PrivacyBlock />
      <PullQuoteDivider />
      <FinalCta />
      <LandingFooter />
    </main>
  );
}
