import { browser } from 'wxt/browser';

/**
 * Platform module (browser-specifics ladder, rung 3). Identical everywhere
 * today; split into per-browser files here if Safari's cookie handling
 * ever diverges.
 */
export async function getCookie(serverUrl: string, name: string): Promise<string | null> {
  const cookie = await browser.cookies.get({ url: serverUrl, name });
  return cookie?.value ?? null;
}

/** Django only sets csrftoken when a page asks for it, so fetch one if missing. */
export function csrfTokenGetter(serverUrl: string): () => Promise<string | null> {
  return async () => {
    const token = await getCookie(serverUrl, 'csrftoken');
    if (token !== null) return token;
    await fetch(`${serverUrl}/`, { credentials: 'include' });
    return getCookie(serverUrl, 'csrftoken');
  };
}
