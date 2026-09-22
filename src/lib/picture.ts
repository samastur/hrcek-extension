import type { HrcekClient } from './api/client';
import type { EntryOut } from './api/types';

/** The server's limit. Above it, the address stands in for the bytes. */
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

/** What the picker decided. `unchanged` is the common case. */
export type PictureChoice =
  { kind: 'unchanged' } | { kind: 'none' } | { kind: 'url'; url: string };

/**
 * The bytes, if they can be had. This succeeds when the extension already
 * has access to that origin — which activeTab grants for the tab you are
 * on, so a picture served from the page's own host works, and one on a
 * CDN usually does not. Null means "use image_url instead", never "fail".
 */
export async function fetchPictureBytes(
  url: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<Blob | null> {
  try {
    // No cookies: reading a picture is not worth handing somebody else's
    // site a credential it did not ask this extension for.
    const response = await fetchFn(url, { credentials: 'omit' });
    if (!response.ok) return null;
    const bytes = await response.blob();
    if (bytes.size === 0 || bytes.size > MAX_PICTURE_BYTES) return null;
    // SVG is refused outright by the server; no point spending an upload.
    if (bytes.type.includes('svg')) return null;
    return bytes;
  } catch {
    return null;
  }
}

function filenameFor(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').pop() ?? '';
    return name.length > 0 ? name : 'picture';
  } catch {
    return 'picture';
  }
}

function messageFor(error: unknown): string {
  // HrcekApiError carries the server's translated message; HrcekNetworkError
  // and any other Error still have something worth showing.
  return error instanceof Error ? error.message : 'The picture could not be attached.';
}

/**
 * Finishes what the entry POST could not. The POST already carried
 * `image_url` when the bytes were unavailable, so only two things are
 * left: uploading bytes when there are any, and deleting a picture that
 * was dropped — a POST cannot remove one.
 *
 * Answers a message when the picture failed, and null when it did not.
 * A picture never fails the entry: the entry is already saved by the
 * time this runs.
 */
export async function attachPicture(
  client: HrcekClient,
  entry: EntryOut,
  choice: PictureChoice,
  bytes: Blob | null,
): Promise<string | null> {
  try {
    if (choice.kind === 'unchanged') return null;
    if (choice.kind === 'none') {
      // 404 is what "there was none to remove" looks like; asking for a
      // delete that was not needed is not a failure worth reporting.
      if (entry.image !== null) await client.deleteImage(entry.id);
      return null;
    }
    if (bytes !== null) {
      await client.uploadImage(entry.id, bytes, filenameFor(choice.url));
    }
    return null;
  } catch (error) {
    return messageFor(error);
  }
}
