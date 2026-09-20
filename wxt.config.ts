import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: ({ browser, manifestVersion, mode }) => ({
    name: 'Hrček',
    description: 'Save links to your Hrček',
    permissions: [
      'activeTab',
      'storage',
      // e2e builds talk to the fake server without the optional-permission
      // dance (Playwright cannot click native permission prompts). MV2 has
      // no separate host_permissions key, so the origins go here.
      ...(mode === 'e2e' && manifestVersion === 2
        ? ['http://localhost/*', 'http://127.0.0.1/*']
        : []),
    ],
    ...(mode === 'e2e' && manifestVersion === 3
      ? { host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'] }
      : {}),
    // The server URL is user-configured, so its origin is requested at
    // runtime (options page). The manifest only declares it requestable.
    ...(manifestVersion === 2
      ? { optional_permissions: ['<all_urls>'] }
      : { optional_host_permissions: ['<all_urls>'] }),
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            // Placeholder AMO id — revisit before first AMO submission.
            gecko: { id: 'hrcek@samastur.com' },
          },
        }
      : {}),
  }),
});
