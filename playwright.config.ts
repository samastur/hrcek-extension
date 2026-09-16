import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // e2e specs must not be picked up by vitest (vitest.config.ts excludes tests/e2e).
  webServer: {
    command: 'pnpm tsx tests/fake-hrcek/main.ts',
    port: 8787,
    reuseExistingServer: !process.env.CI,
  },
});
