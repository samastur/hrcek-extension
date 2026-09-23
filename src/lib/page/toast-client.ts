import { browser } from 'wxt/browser';
import { injectFile } from '../platform/inject';

/**
 * Says something on the page. Any failure is silence: a PDF viewer, a
 * `chrome://` page, the Web Store, a tab that closed — none of them can
 * host a toast, and none of them is a save that went wrong. The toolbar
 * icon is the confirmation in that case.
 *
 * Resolves always. The caller closes itself immediately afterwards and
 * has nothing it could do with a rejection.
 */
export async function showToast(
  tabId: number,
  text: string,
  kind: 'success' | 'error',
): Promise<void> {
  try {
    await injectFile(tabId, 'toast.js');
    await browser.tabs.sendMessage(tabId, { type: 'hrcek:toast', text, kind });
  } catch {
    // Nowhere to say it. The entry is saved either way.
  }
}
