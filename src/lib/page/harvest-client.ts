import { browser } from 'wxt/browser';
import { injectFile } from '../platform/inject';
import { rankCandidates, type Candidate, type RawCandidate } from './candidates';

/**
 * What this page offers, ranked. Any failure answers an empty list: a
 * page that cannot be read — a PDF, a privileged page, a tab that closed
 * — simply offers no picture, and that is not an error worth showing.
 *
 * Asking is the same call on both browsers; answering is not. The
 * injected script must reply with `sendResponse` and `return true`,
 * because Chrome discards a Promise returned from `onMessage` and hands
 * this call `undefined` — which is indistinguishable here from a page
 * with no pictures. See the listener in `entrypoints/harvest.ts`.
 */
export async function harvestCandidates(tabId: number): Promise<Candidate[]> {
  try {
    await injectFile(tabId, 'harvest.js');
    const reply = (await browser.tabs.sendMessage(tabId, { type: 'hrcek:harvest' })) as
      { candidates?: RawCandidate[] } | undefined;
    // This call must stay inside the try: a reply whose `candidates` is
    // present but not an array (the page script sent something odd) is
    // not caught by the `??` above — it throws here instead, and that
    // throw is what turns it into an empty list.
    return rankCandidates(reply?.candidates ?? []);
  } catch (error) {
    // A page that cannot be read offers no picture, which is not a
    // failure worth showing — a PDF would say it every single time.
    console.warn('[hrcek] could not read the page’s pictures', error);
    return [];
  }
}
