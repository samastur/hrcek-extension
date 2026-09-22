import type { BrowserContext, Page } from '@playwright/test';
import { expect, SERVER, test } from './fixtures';

const FAKE_TOKEN = 'hrcek_test_token';
const FAKE_IDENTIFIER = 'nina@example.com';
const FAKE_PASSWORD = 'correct horse';

test.beforeEach(async () => {
  await fetch(`${SERVER}/__reset`, { method: 'POST' });
});

async function openOptions(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  return page;
}

async function configureToken(
  context: BrowserContext,
  extensionId: string,
): Promise<void> {
  const page = await openOptions(context, extensionId);
  await page.fill('#server-url', SERVER);
  await page.fill('#token', FAKE_TOKEN);
  await page.click('#save');
  await expect(page.locator('#status')).toHaveAttribute('data-kind', 'success');
  await page.close();
}

async function openPopup(
  context: BrowserContext,
  extensionId: string,
  url: string,
  title: string,
): Promise<Page> {
  const page = await context.newPage();
  const query = new URLSearchParams({ url, title });
  await page.goto(`chrome-extension://${extensionId}/popup.html?${query}`);
  return page;
}

test('shows a pointer to settings when unconfigured', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId, 'https://example.com/a', 'A');
  await expect(popup.locator('#open-options')).toBeVisible();
});

test('options page saves settings and tests the connection', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const page = await openOptions(context, extensionId);
  await page.click('#test');
  await expect(page.locator('#status')).toContainText('nina@example.com');
});

test('saves a new entry from the popup', async ({ context, extensionId }) => {
  await configureToken(context, extensionId);
  const popup = await openPopup(
    context,
    extensionId,
    'https://example.com/watch',
    'A watch',
  );

  await expect(popup.locator('#address')).toHaveText('https://example.com/watch');
  await expect(popup.locator('#title')).toHaveValue('A watch');
  await popup.fill('#notes', '38mm, sapphire');
  await popup.locator('.chip-input').fill('watches');
  await popup.locator('.chip-input').press(',');
  await popup.locator('.chip-input').fill('diving');
  await popup.locator('.chip-input').press(',');
  await expect(popup.locator('.chip')).toHaveCount(2);
  await popup.click('#save');

  await expect(popup.locator('#status')).toContainText('Saved.');
});

test('reopening a saved address prefills the existing entry and updates it', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const first = await openPopup(
    context,
    extensionId,
    'https://example.com/watch',
    'A watch',
  );
  await first.fill('#notes', 'original notes');
  await first.click('#save');
  await expect(first.locator('#status')).toContainText('Saved.');
  await first.close();

  const second = await openPopup(
    context,
    extensionId,
    'https://example.com/watch',
    'ignored',
  );
  await expect(second.locator('.hrcek-header .aside')).toBeVisible();
  await expect(second.locator('#notes')).toHaveValue('original notes');
  await second.fill('#title', 'A watch, revisited');
  await second.click('#save');
  await expect(second.locator('#status')).toContainText('Updated.');
});

test('offers the account’s own fields and saves a choice', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const popup = await openPopup(context, extensionId, 'https://example.com/x', 'X');

  // Built from GET /api/fields/, never hard-coded on the client side.
  await popup.locator('#fields').click();
  await expect(popup.locator('[data-field="Price"]')).toBeVisible();
  await popup.locator('[data-field="Price"]').fill('129');
  await popup.locator('[data-field="Priority"]').selectOption('high');
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Saved.');

  const reopened = await openPopup(context, extensionId, 'https://example.com/x', 'X');
  await reopened.locator('#fields').click();
  await expect(reopened.locator('[data-field="Price"]')).toHaveValue('129');
  await expect(reopened.locator('[data-field="Priority"]')).toHaveValue('high');
});

test('preserves a choice value the account no longer offers', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const url = 'https://example.com/orphan';

  // Save an entry with Priority set to a value that is still offered here.
  const setup = await openPopup(context, extensionId, url, 'Orphan');
  await setup.locator('#fields').click();
  await setup.locator('[data-field="Priority"]').selectOption('high');
  await setup.click('#save');
  await expect(setup.locator('#status')).toContainText('Saved.');
  await setup.close();

  // The account's options changed since: 'high' is no longer offered.
  const popup = await context.newPage();
  await popup.route('**/api/fields/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { name: 'Price', kind: 'number', options: [] },
          { name: 'Priority', kind: 'choice', options: ['medium', 'low'] },
        ],
        count: 2,
      }),
    });
  });
  const query = new URLSearchParams({ url, title: 'ignored' });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?${query}`);

  await popup.locator('#fields').click();
  const priority = popup.locator('[data-field="Priority"]');
  await expect(priority).toHaveValue('high');
  await expect(priority.locator('option[value="high"]')).toHaveText(/no longer offered/);

  // Saving without touching Priority must not clear it.
  await popup.fill('#title', 'Orphan, revisited');
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Updated.');

  // Reopen normally — the account's real options are back, and the value
  // the popup never touched came through the save untouched.
  const reopened = await openPopup(context, extensionId, url, 'ignored');
  await reopened.locator('#fields').click();
  await expect(reopened.locator('[data-field="Priority"]')).toHaveValue('high');
});

test('a failed initial lookup does not let Save blind-replace an existing entry', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);

  // Save an entry with notes/tags so a blind replace would be observable.
  const url = 'https://example.com/blip';
  const setup = await openPopup(context, extensionId, url, 'Blip');
  await setup.fill('#notes', 'precious notes');
  await setup.locator('.chip-input').fill('keep');
  await setup.locator('.chip-input').press(',');
  await setup.click('#save');
  await expect(setup.locator('#status')).toContainText('Saved.');
  await setup.close();

  // Simulate a network blip on the popup's initial look-before-write only;
  // let any later by-url lookup (the save-time retry) through normally.
  const popup = await context.newPage();
  let byUrlCalls = 0;
  await popup.route('**/api/entries/by-url/**', async (route) => {
    byUrlCalls += 1;
    if (byUrlCalls === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  const query = new URLSearchParams({ url, title: 'ignored' });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?${query}`);

  // Initial lookup failed: an empty form is shown, with an error note —
  // but Save is still armed.
  await expect(popup.locator('.hrcek-header .aside')).toHaveCount(0);
  await expect(popup.locator('#notes')).toHaveValue('');
  await expect(popup.locator('#status')).toHaveAttribute('data-kind', 'error');

  // Saving now must re-check before writing, not blind-replace the held entry.
  await popup.click('#save');
  await expect(popup.locator('.hrcek-header .aside')).toBeVisible();
  await expect(popup.locator('#notes')).toHaveValue('precious notes');
  await expect(popup.locator('#status')).not.toContainText('Saved.');
  await expect(popup.locator('#status')).not.toContainText('Updated.');

  // A second, conscious Save now proceeds normally.
  await popup.fill('#title', 'Blip, revisited');
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Updated.');
  await expect(popup.locator('#notes')).toHaveValue('precious notes');
});

test('mints a token from credentials, then saves with it', async ({
  context,
  extensionId,
}) => {
  const options = await openOptions(context, extensionId);
  await options.fill('#server-url', SERVER);
  await options.fill('#identifier', FAKE_IDENTIFIER);
  await options.fill('#password', FAKE_PASSWORD);
  await options.click('#create');

  await expect(options.locator('#status')).toContainText('Token created as');
  await expect(options.locator('#status')).toContainText('Hrček extension');
  await expect(options.locator('#password')).toHaveValue(''); // never kept
  // The minted token is what the extension will use from now on.
  await expect(options.locator('#token')).toHaveValue(/^hrcek_/);
  await options.close();

  const popup = await openPopup(context, extensionId, 'https://example.com/s', 'S');
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Saved.');
});

test('hides the picture field when the page offered nothing, and still saves', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const address = 'https://example.com/article';
  const popup = await openPopup(context, extensionId, address, 'Article');

  // The picker only appears when the page offered something. Here the
  // popup IS the active tab, so nothing is harvested and the row is
  // absent — which is itself the behaviour worth pinning down.
  await expect(popup.locator('#picture-field')).toBeHidden();
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Saved.');
});

test('keeps the tags and fields an entry holds when only the title changes', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const address = 'https://example.com/held';
  await fetch(`${SERVER}/api/entries/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FAKE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: address,
      title: 'Before',
      tags: ['diving'],
      fields: { Price: '129' },
    }),
  });

  const popup = await openPopup(context, extensionId, address, 'ignored');
  await expect(popup.locator('.chip')).toHaveCount(1);
  await popup.fill('#title', 'After');
  await popup.locator('#fields').click();
  await popup.locator('[data-field="Price"]').fill('99');
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Updated.');

  const entry = await (
    await fetch(`${SERVER}/api/entries/by-url/?url=${encodeURIComponent(address)}`, {
      headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
    })
  ).json();
  expect(entry.title).toBe('After');
  // POST replaces entry attributes, so the tag only survives because the
  // form resent it. fields is PATCHED, not replaced, so a stale Price would
  // pass even with no field wiring at all — proving that path instead
  // requires actually changing the value and checking the new one landed.
  expect(entry.tags).toEqual(['diving']);
  expect(entry.fields).toEqual({ Price: '99' });
});

test('says what to do when the server cannot mint tokens', async ({
  context,
  extensionId,
}) => {
  const options = await openOptions(context, extensionId);
  // An older Hrček, without the exchange route, answers 404 here.
  await options.route(`${SERVER}/api/auth/tokens/exchange`, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'HRC-CORE-0003', message: 'Not found.', details: {} },
      }),
    }),
  );

  await options.fill('#server-url', SERVER);
  await options.fill('#identifier', FAKE_IDENTIFIER);
  await options.fill('#password', FAKE_PASSWORD);
  await options.click('#create');

  await expect(options.locator('#status')).toHaveAttribute('data-kind', 'error');
  await expect(options.locator('#status')).toContainText('clients page');
});
