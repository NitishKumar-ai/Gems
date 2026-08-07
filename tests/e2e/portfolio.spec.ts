import { test, expect } from '@playwright/test';

// The profile page renders a published journey out of the database — see
// tests/e2e/global-setup.ts, which seeds testuser/testrepo before any of this runs.
//
// Removed here: two specs that drove LiveVibeReplay. Phase 4 stopped mounting that
// component on the profile and Phase 5 did not put it back, because the page now shows a
// real person's published metrics and the replay only has invented commits to offer. The
// component is still in the tree for when there is real commit data to feed it. One of the
// deleted specs was the ISSUE-001 regression guard (diff lines sharing a row); it is
// tracked in TODOS.md so it comes back with the feature rather than being quietly lost.

test.describe('VibeCoder Portfolio Flow', () => {
  test('should allow a user to import a repo and view the portfolio page', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('nav')).toContainText('VibeCoder_');
    await expect(page.locator('h1')).toContainText('Vibe Coding.');

    const repoInput = page.locator('input#repoUrl');
    await repoInput.fill('https://github.com/testuser/testrepo');

    // Hold the import response open so the loading state is observable. /api/import is a
    // regex match, so it usually returns faster than an assertion can catch the button
    // text — this test failed ~1 run in 3 before the delay was added.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/import', async (route) => {
      await held;
      await route.continue();
    });

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await expect(submitButton).toContainText('Analyzing Vibes...');
    await expect(submitButton).toBeDisabled();
    release();

    await page.waitForURL('/testuser/testrepo');

    await expect(page.locator('h1')).toContainText('testrepo');
    await expect(page.locator('h2')).toContainText('@testuser');

    await expect(page.locator('text=The Vibe Journey')).toBeVisible();
    await expect(page.getByText("Gem's Verdict")).toBeVisible();
    await expect(page.getByText("Gem's Roast")).toBeVisible();

    // Model tags come from the transcript now, so this asserts a real model id rather than
    // the invented string the mock used to emit.
    await expect(page.locator('text=Built With')).toBeVisible();
    await expect(page.getByText('claude-opus-5').first()).toBeVisible();
  });

  test('the profile renders metrics derived from the published journey', async ({ page }) => {
    await page.goto('/testuser/testrepo');

    // 16 seeded sessions, 12 edits each. Scoped to the tile — the same number also appears
    // inside the Getting Better evidence line ("across 192 edits").
    await expect(page.getByText('Sessions', { exact: true })).toBeVisible();
    await expect(page.getByText('192', { exact: true })).toBeVisible();

    // Evidence-before-edit steps from 7/12 to 12/12 halfway through the fixture, so both
    // the pooled rate and a positive trend have to render.
    await expect(page.getByText('Evidence Before Edit')).toBeVisible();
    await expect(page.getByText('Evolution')).toBeVisible();
  });

  // Phase 5. Badges are the payoff for the longitudinal store, so the profile has to show
  // both what was earned and what it was earned from.
  test('achievements render with the evidence that earned them', async ({ page }) => {
    await page.goto('/testuser/testrepo');

    await expect(page.getByRole('heading', { name: /Achievements/ })).toBeVisible();

    // The fixture is 16 sessions over 16 distinct days with zero tool failures, which earns
    // First Light, Flawless Run, Clean Hands and Fortnight.
    await expect(page.getByText('First Light')).toBeVisible();
    await expect(page.getByText('Fortnight')).toBeVisible();

    // A badge that does not name its numbers is just a sticker.
    await expect(page.getByText('14 distinct days')).toBeVisible();

    // Locked badges sit behind a disclosure and carry progress toward the next one.
    const locked = page.getByText(/\d+ still locked/);
    await expect(locked).toBeVisible();
    await locked.click();
    await expect(page.getByText('Long Haul')).toBeVisible();
  });
});
