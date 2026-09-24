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
      // Chromium's sandbox needs unprivileged user namespaces, which
      // Ubuntu 24.04 denies through AppArmor. Denied, the browser does not
      // fail — it hangs on launch, so Playwright reports the test count and
      // then nothing at all. CI ran six hours that way. Harmless locally,
      // and a CI runner is already a disposable container.
      args: [
        '--no-sandbox',
        // /dev/shm is small on a runner; Chromium falls over without this.
        '--disable-dev-shm-usage',
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
