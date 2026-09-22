import { browser } from 'wxt/browser';

/**
 * Runs a file in a tab. MV3 has scripting.executeScript, MV2 has
 * tabs.executeScript, and the two do not share a signature — rung three
 * of the browser ladder, because no build-time switch can bridge them.
 */
export async function injectFile(tabId: number, file: string): Promise<void> {
  const api = browser as unknown as {
    scripting?: { executeScript(details: unknown): Promise<unknown> };
    tabs: { executeScript(tabId: number, details: unknown): Promise<unknown> };
  };
  if (api.scripting !== undefined) {
    await api.scripting.executeScript({ target: { tabId }, files: [file] });
    return;
  }
  await api.tabs.executeScript(tabId, { file: `/${file}` });
}
