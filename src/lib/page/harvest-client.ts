import { browser } from 'wxt/browser';
import { injectFile } from '../platform/inject';
import { rankCandidates, type Candidate, type RawCandidate } from './candidates';

/**
 * What this page offers, ranked. Any failure answers an empty list: a
 * page that cannot be read — a PDF, a privileged page, a tab that closed
 * — simply offers no picture, and that is not an error worth showing.
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
  } catch {
    return [];
  }
}
