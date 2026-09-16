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
  await page.check('#mode-token');
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

test('password mode: logs in and saves through the session with CSRF', async ({
  context,
  extensionId,
}) => {
  const options = await openOptions(context, extensionId);
  await options.fill('#server-url', SERVER);
  await options.check('#mode-session');
  await options.fill('#identifier', FAKE_IDENTIFIER);
  await options.fill('#password', FAKE_PASSWORD);
  await options.click('#save');
  await expect(options.locator('#status')).toContainText('Signed in as nina@example.com');
  await expect(options.locator('#password')).toHaveValue(''); // never kept
  await options.close();

  const popup = await openPopup(context, extensionId, 'https://example.com/s', 'S');
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Saved.');
});
