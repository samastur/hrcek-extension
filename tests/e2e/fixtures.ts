import path from 'node:path';
import { test as base, chromium, type BrowserContext } from '@playwright/test';

export const SERVER = 'http://127.0.0.1:8787';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const extensionPath = path.resolve('.output/chrome-mv3-e2e');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', // headless chromium supports extensions
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;
