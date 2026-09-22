import type { RawCandidate } from '../lib/page/candidates';

/**
 * Reads the pictures this page offers. Injected on demand when the popup
 * opens, under activeTab — not registered, because the extension has no
 * business running on every page you load.
 *
 * It answers a message rather than a return value: MV2 and MV3 disagree
 * about what an injected file's result is, and a message is the same on
 * both.
 */
const HEAD_SELECTORS = [
  'meta[property="og:image"]',
  'meta[property="og:image:secure_url"]',
  'meta[name="twitter:image"]',
  'meta[name="twitter:image:src"]',
  'link[rel="image_src"]',
  'meta[itemprop="image"]',
];

function absolute(raw: string | null): string | null {
  if (raw === null || raw.trim().length === 0) return null;
  try {
    return new URL(raw, document.baseURI).href;
  } catch {
    return null;
  }
}

function collect(): RawCandidate[] {
  const found: RawCandidate[] = [];

  for (const selector of HEAD_SELECTORS) {
    for (const node of document.querySelectorAll(selector)) {
      const url = absolute(node.getAttribute('content') ?? node.getAttribute('href'));
      // Size is unknown here, and the ranking knows not to hold that
      // against a head declaration.
      if (url !== null) found.push({ url, width: 0, height: 0, fromHead: true });
    }
  }

  for (const image of document.images) {
    // currentSrc, so srcset and <picture> give what is actually shown.
    const url = absolute(image.currentSrc || image.src);
    if (url === null) continue;
    // naturalWidth is 0 for an image that has not loaded — a lazy one
    // below the fold — so the rendered box stands in.
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    found.push({ url, width, height, fromHead: false });
  }

  return found;
}

export default defineUnlistedScript(() => {
  const flag = '__hrcekHarvestReady';
  const scope = window as unknown as Record<string, unknown>;
  // Injected once per popup opening; a second injection must not add a
  // second listener, or every answer would arrive twice.
  if (scope[flag] === true) return;
  scope[flag] = true;

  browser.runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: string }).type !== 'hrcek:harvest') return undefined;
    return Promise.resolve({ candidates: collect() });
  });
});
