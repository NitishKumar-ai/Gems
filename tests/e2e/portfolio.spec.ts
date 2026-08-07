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

    // 4. Submit the form
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // 5. Verify the button shows loading state
    await expect(submitButton).toContainText('Analyzing Vibes...');

    // 6. Verify we get redirected to the portfolio page
    // The mock data takes 1.5 seconds, so we wait for URL to change
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
