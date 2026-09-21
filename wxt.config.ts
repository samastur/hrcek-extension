import { defineConfig } from 'wxt';

// The colour icon set for the toolbar button, keyed by the manifest field
// the hook below writes it into (`action` on MV3, `browser_action` on
// MV2).
const defaultIcon = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  128: 'icon/128.png',
};

export default defineConfig({
  srcDir: 'src',
  // WXT's publicDir default is `<root>/public`, unaffected by srcDir — it
  // must be set explicitly so `src/public` (icons, static assets) is
  // copied into the build.
  publicDir: 'src/public',
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
  hooks: {
    // A plain `manifest: { action: { default_icon } }` (rung one of the
    // browser ladder) is not enough: on MV2, WXT's popup-entrypoint
    // handling writes straight to `browser_action` while building the
    // manifest, and WXT's own action->browser_action fallback then no-ops
    // because `browser_action` already exists — so a static config value
    // would be silently dropped on Firefox specifically. This hook is
    // still rung one (pure `wxt.config.ts` config, no per-browser code):
    // it re-applies default_icon after entrypoints are added but before
    // WXT finalizes the manifest, onto whichever key (`action` for MV3,
    // `browser_action` for MV2) this build actually uses.
    'build:manifestGenerated': (wxt, manifest) => {
      const target =
        wxt.config.manifestVersion === 2
          ? (manifest.browser_action ??= {})
          : (manifest.action ??= {});
      target.default_icon = defaultIcon;
    },
  },
});
