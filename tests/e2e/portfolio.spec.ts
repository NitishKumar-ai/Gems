import { test, expect } from '@playwright/test';

test.describe('VibeCoder Portfolio Flow', () => {
  test('should allow a user to import a repo and view the portfolio page', async ({ page }) => {
    // 1. Visit the home page
    await page.goto('/');

    // 2. Verify we are on the VibeCoder landing page
    await expect(page.locator('h1')).toContainText('VibeCoder');

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
    await expect(page.locator('text=Gem\\'s Verdict')).toBeVisible();
    await expect(page.locator('text=Gem\\'s Roast')).toBeVisible();

    // 10. Verify Model Tags are present
    await expect(page.locator('text=Built With')).toBeVisible();
    await expect(page.locator('text=GPT-4o').first()).toBeVisible();
  });
});
