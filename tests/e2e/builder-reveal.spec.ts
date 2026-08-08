import { test, expect } from '@playwright/test';

// BuilderReveal (src/components/BuilderReveal.tsx) only renders when a Journey has a populated
// `analysis` column — see tests/e2e/global-setup.ts's `builder/reveal` fixture, seeded
// specifically for this spec with a hand-built AnalysisResult (fixtureAnalysis()) so this test
// never depends on a live Anthropic call.
//
// This is intentionally the only spec that mentions BuilderReveal. portfolio.spec.ts and
// publish-api.spec.ts run against fixtures whose `analysis` column is null and never reference
// the component, which is what proves it falls through cleanly when there is nothing to show.

test.describe('Builder Report reveal', () => {
  test('renders the archetype card first and auto-advances to the next card', async ({ page }) => {
    await page.goto('/builder/reveal');

    await expect(page.getByText('Builder Report')).toBeVisible();
    await expect(page.getByText('Your Builder Archetype')).toBeVisible();
    await expect(page.getByText('The Evidence Hound')).toBeVisible();

    // Auto-play is on by default (isPlaying starts true) — the pause icon, not play, should show.
    await expect(page.getByLabel('Pause')).toBeVisible();

    // The setTimeout in the auto-advance effect fires at 4000ms; wait past it and the stats
    // card (second in the deck) should have replaced the archetype card.
    await expect(page.getByText('Sessions', { exact: true })).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('Your Builder Archetype')).not.toBeVisible();
  });

  test('pausing stops auto-advance', async ({ page }) => {
    await page.goto('/builder/reveal');

    await expect(page.getByText('Your Builder Archetype')).toBeVisible();
    await page.getByLabel('Pause').click();
    await expect(page.getByLabel('Play')).toBeVisible();

    // If auto-advance were still running this would have moved to the stats card by now.
    await page.waitForTimeout(4500);
    await expect(page.getByText('Your Builder Archetype')).toBeVisible();
  });

  test('manual navigation moves one card at a time and disables at both ends', async ({ page }) => {
    await page.goto('/builder/reveal');

    // Scoped to the reveal's own wrapper (the only element on the page using
    // `bg-gradient-to-b`) — the rest of the profile page (Achievements, RubricCard) repeats
    // labels like "Sessions" and dimension names, which makes unscoped text locators ambiguous.
    const reveal = page.locator('.bg-gradient-to-b.from-zinc-950');
    const prevButton = page.getByLabel('Previous card');
    const nextButton = page.getByLabel('Next card');

    // First card: Previous is disabled, clicking pauses autoplay (Play icon shows).
    await expect(prevButton).toBeDisabled();
    await nextButton.click();
    await expect(page.getByLabel('Play')).toBeVisible();
    await expect(reveal.getByText('Sessions', { exact: true })).toBeVisible();

    // Click through the remaining cards (5 total: archetype, stats, achievement, rubric,
    // growth-edge — one Next click already consumed above) to reach the end. The button
    // disables itself at the boundary (goTo()'s Math.min clamp plus the `disabled` prop), so
    // once disabled, further clicks are inert — the boundary is what's under test, not a raw
    // click flood past a disabled control.
    for (let i = 0; i < 3; i++) {
      await nextButton.click();
    }
    await expect(reveal.getByText('Your Growth Edge')).toBeVisible();
    await expect(nextButton).toBeDisabled();
    // One more click attempt against the disabled button is a no-op — clamped, not skipped past.
    await nextButton.click({ force: true }).catch(() => {});
    await expect(reveal.getByText('Your Growth Edge')).toBeVisible();

    // Previous walks back down to the first card and clamps at 0 rather than going negative.
    for (let i = 0; i < 4; i++) {
      await prevButton.click();
    }
    await expect(reveal.getByText('Your Builder Archetype')).toBeVisible();
    await expect(prevButton).toBeDisabled();
  });

  test('the achievement and rubric cards render with real evidence between the stats and growth-edge cards', async ({
    page,
  }) => {
    await page.goto('/builder/reveal');
    const reveal = page.locator('.bg-gradient-to-b.from-zinc-950');
    const nextButton = page.getByLabel('Next card');

    await nextButton.click(); // -> stats
    await nextButton.click(); // -> achievement
    await expect(reveal.getByText('Achievement Unlocked')).toBeVisible();

    await nextButton.click(); // -> rubric
    await expect(reveal.getByText(/Discipline|Craft|Hygiene/).first()).toBeVisible();
  });

  test('the share button copies the profile URL and flips its label, repeatably', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/builder/reveal');

    const nextButton = page.getByLabel('Next card');
    for (let i = 0; i < 4; i++) {
      await nextButton.click();
    }

    const shareButton = page.getByRole('button', { name: 'Share this report' });
    await expect(shareButton).toBeVisible();
    await shareButton.click();
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('/builder/reveal');

    // Clicking again while already showing "Link copied" must not throw or get stuck — it
    // re-copies and the label stays put.
    await page.getByRole('button', { name: 'Link copied' }).click();
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  });

  test('a profile with no analysis renders no Builder Report reveal at all', async ({ page }) => {
    await page.goto('/testuser/testrepo');

    await expect(page.getByText('Builder Report')).toHaveCount(0);
    await expect(page.getByText('Your Builder Archetype')).toHaveCount(0);
    // The rest of the page still renders normally — the reveal falls through cleanly.
    await expect(page.getByRole('heading', { name: /Achievements/ })).toBeVisible();
  });
});
