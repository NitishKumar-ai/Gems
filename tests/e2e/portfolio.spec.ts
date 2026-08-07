import { test, expect } from '@playwright/test';

test.describe('VibeCoder Portfolio Flow', () => {
  test('should allow a user to import a repo and view the portfolio page', async ({ page }) => {
    // 1. Visit the home page
    await page.goto('/');

    // 2. Verify we are on the VibeCoder landing page
    await expect(page.locator('nav')).toContainText('VibeCoder_');
    await expect(page.locator('h1')).toContainText('Vibe Coding.');

    // 3. Fill in the GitHub repository URL
    const repoInput = page.locator('input#repoUrl');
    await repoInput.fill('https://github.com/testuser/testrepo');

    // 4. Hold the import response open so the loading state is observable.
    // /api/import is a regex match, so it usually returns faster than an
    // assertion can catch the button text — this test failed ~1 run in 3 before
    // the delay was added.
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

    // 5. Verify the button shows loading state and blocks a second submit
    await expect(submitButton).toContainText('Analyzing Vibes...');
    await expect(submitButton).toBeDisabled();
    release();

    // 6. Verify we get redirected to the portfolio page
    await page.waitForURL('/testuser/testrepo');

    // 7. Verify Portfolio Page Header
    await expect(page.locator('h1')).toContainText('testrepo');
    await expect(page.locator('h2')).toContainText('@testuser');

    // 8. Verify the Replay component rendered
    await expect(page.locator('text=The Vibe Journey')).toBeVisible();
    await expect(page.locator('text=Live Vibe Replay')).toBeVisible();
    
    // 9. Verify the Gem Roast component rendered
    await expect(page.locator('text=Gem\'s Verdict')).toBeVisible();
    await expect(page.locator('text=Gem\'s Roast')).toBeVisible();

    // 10. Verify Model Tags are present
    await expect(page.locator('text=Built With')).toBeVisible();
    await expect(page.locator('text=GPT-4o').first()).toBeVisible();
  });

  // Regression: ISSUE-001 — every diff line rendered on the same row
  // Found by /qa on 2026-08-07
  // Report: .gstack/qa-reports/qa-report-localhost-2026-08-07.md
  test('each diff line occupies its own row and does not scroll sideways', async ({ page }) => {
    await page.goto('/testuser/testrepo');
    await expect(page.locator('text=Live Vibe Replay')).toBeVisible();

    const layout = await page.locator('pre').first().evaluate((pre) => {
      const spans = Array.from(pre.querySelectorAll('span'));
      const rows = new Set(spans.map((s) => Math.round(s.getBoundingClientRect().top)));
      return {
        lines: spans.length,
        rows: rows.size,
        scrollWidth: pre.scrollWidth,
        clientWidth: pre.clientWidth,
      };
    });

    // The first mock commit is a 4-line diff. Full-width inline-block spans laid
    // them out side by side, so all 4 shared one row and the viewer needed ~4x its
    // own width. One row per line, and no horizontal overflow.
    expect(layout.lines).toBeGreaterThan(1);
    expect(layout.rows).toBe(layout.lines);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  });

  test('the replay advances on play and restarts once the journey has finished', async ({ page }) => {
    await page.goto('/testuser/testrepo');

    const counter = page.locator('text=/^\\d+ \\/ \\d+$/').first();
    await expect(counter).toHaveText('1 / 3');

    // Play advances one commit every 2.5s.
    await page.getByTitle('Play replay').click();
    await expect(counter).toHaveText('2 / 3', { timeout: 6000 });

    // Pause holds position.
    await page.getByTitle('Pause replay').click();
    await expect(page.getByTitle('Play replay')).toBeVisible();
    await expect(counter).toHaveText('2 / 3');

    // Run to the end, then verify play restarts from the first commit rather
    // than sitting dead on the last one.
    await page.getByTitle('Play replay').click();
    await expect(counter).toHaveText('3 / 3', { timeout: 6000 });
    await expect(page.getByTitle('Play replay')).toBeVisible({ timeout: 6000 });

    await page.getByTitle('Play replay').click();
    await expect(counter).toHaveText('1 / 3');
  });
});
