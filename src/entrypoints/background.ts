import { browser } from 'wxt/browser';
import { setIcon } from '../lib/icon';
import { loadSettings } from '../lib/settings';

/**
 * The toolbar button's resting state. Whether a particular page is
 * already held is decided per tab; that arrives in a later change.
 */
async function paintFromSettings(): Promise<void> {
  const settings = await loadSettings();
  const configured = settings !== null && settings.token !== null;
  await setIcon(configured ? 'configured' : 'unconfigured');
}

export default defineBackground(() => {
  void paintFromSettings();
  // The options page writes settings; the toolbar should not wait for a
  // restart to notice that a token arrived.
  browser.storage.local.onChanged.addListener((changes) => {
    if ('settings' in changes) void paintFromSettings();
  });
});
