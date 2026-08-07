import { test, expect } from '@playwright/test';

import { INTRUDER_API_KEY, OWNER_API_KEY } from './global-setup';

/**
 * `/api/publish` is the trust boundary between the plugin and the public profile. The API key says
 * who is publishing; the request body says where it lands. Every test here is about what happens
 * when those two disagree.
 *
 * Serial, and pointed at `owner/publishtarget` rather than the profile specs' `testuser/testrepo`.
 * These tests write, so they need a row of their own — sharing one made them race the rendering
 * specs under fullyParallel and clobber the fixture out from under whichever ran second.
 */

test.describe.configure({ mode: 'serial' });

const ENDPOINT = '/api/publish';
const TARGET = { username: 'owner', repo: 'publishtarget' };

/** Distinctive numbers so the page assertions can tell whose write landed. */
const OWNER_EDITS = 4242;
const INTRUDER_EDITS = 9999;

function payload(edits: number, overrides: Record<string, unknown> = {}) {
  return {
    ...TARGET,
    metrics: { schema: 2, totals: { sessions: 3, edits, rates: {}, models: {} } },
    ...overrides,
  };
}

test.describe('POST /api/publish', () => {
  test('rejects a request with no Authorization header', async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: payload(1) });
    expect(res.status()).toBe(401);
  });

  test('rejects an unknown API key', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: payload(1),
      headers: { Authorization: 'Bearer not-a-real-key' },
    });
    expect(res.status()).toBe(401);
  });

  // An empty bearer token used to reach the database lookup, where it could match a user row whose
  // apiKey column was never populated.
  test('rejects an empty bearer token without a lookup', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: payload(1),
      headers: { Authorization: 'Bearer ' },
    });
    expect(res.status()).toBe(401);
  });

  test('rejects a request missing required fields', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: { username: 'owner' },
      headers: { Authorization: `Bearer ${OWNER_API_KEY}` },
    });
    expect(res.status()).toBe(400);
  });

  test('accepts the owner republishing their own profile', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: payload(OWNER_EDITS),
      headers: { Authorization: `Bearer ${OWNER_API_KEY}` },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, url: '/owner/publishtarget' });
  });

  // The one that matters. Before the ownership check this returned 200 and reassigned `userId` on
  // the existing row, so any valid key could overwrite a public profile and take it over.
  test('refuses to let a different account overwrite a profile it does not own', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: payload(INTRUDER_EDITS),
      headers: { Authorization: `Bearer ${INTRUDER_API_KEY}` },
    });

    expect(res.status()).toBe(403);
  });

  test('the refused write never reached the published profile', async ({ page }) => {
    await page.goto('/owner/publishtarget');

    await expect(page.getByText(String(OWNER_EDITS), { exact: true })).toBeVisible();
    await expect(page.getByText(String(INTRUDER_EDITS))).toHaveCount(0);
  });

  test('a second account may still publish under a profile nobody has taken', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: payload(7, { username: 'intruder', repo: 'ownrepo' }),
      headers: { Authorization: `Bearer ${INTRUDER_API_KEY}` },
    });

    expect(res.status()).toBe(200);
  });
});
