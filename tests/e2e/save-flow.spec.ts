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

  await expect(popup.locator('#url')).toHaveValue('https://example.com/watch');
  await expect(popup.locator('#title')).toHaveValue('A watch');
  await popup.fill('#notes', '38mm, sapphire');
  await popup.fill('#tags', 'watches, diving');
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
  await expect(second.locator('#existing-note')).toBeVisible();
  await expect(second.locator('#notes')).toHaveValue('original notes');
  await second.fill('#title', 'A watch, revisited');
  await second.click('#save');
  await expect(second.locator('#status')).toContainText('Updated.');
});

test('shows the server message for an unknown field', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const popup = await openPopup(context, extensionId, 'https://example.com/x', 'X');

  await popup.click('#add-field');
  await popup.fill('.field-name', 'colour');
  await popup.fill('.field-value', 'red');
  await popup.click('#save');

  await expect(popup.locator('#status')).toHaveAttribute('data-kind', 'error');
  await expect(popup.locator('#status')).toContainText('no field with that name');
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
  await setup.fill('#tags', 'keep');
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
  await expect(popup.locator('#existing-note')).toHaveCount(0);
  await expect(popup.locator('#notes')).toHaveValue('');
  await expect(popup.locator('#status')).toHaveAttribute('data-kind', 'error');

  // Saving now must re-check before writing, not blind-replace the held entry.
  await popup.click('#save');
  await expect(popup.locator('#existing-note')).toBeVisible();
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
