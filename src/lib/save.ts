import type { HrcekClient, SaveResult } from './api/client';
import { HrcekApiError } from './api/errors';
import type { EntryOut } from './api/types';

export interface SaveRequest {
  url: string;
  title: string;
  notes: string;
  tags: string[];
  /**
   * Every field the form rendered, empty ones as "" to clear them.
   * `fields` is patched, not replaced, so anything omitted keeps its old
   * value — which is why nothing the form did not show may appear here.
   */
  fields: Record<string, string>;
  /**
   * An address for the server to fetch, when the bytes could not be read
   * here. Left undefined the attribute is not sent at all, and the entry
   * keeps whatever picture it had — omission is the documented no-op.
   */
  imageUrl?: string;
}

/** Look before writing: POST replaces, so the UI must show what it replaces. */
export async function loadExisting(
  client: HrcekClient,
  url: string,
): Promise<EntryOut | null> {
  try {
    return await client.getEntryByUrl(url);
  } catch (error) {
    if (error instanceof HrcekApiError && error.code === 'HRC-CORE-0003') return null;
    throw error;
  }
}

/**
 * The single submit boundary. A future offline queue slots in here:
 * persist the request when the server is unreachable instead of throwing.
 */
export async function submitSave(
  client: HrcekClient,
  request: SaveRequest,
): Promise<SaveResult> {
  return client.saveEntry({
    // title, notes and tags always go in full: POST replaces, so a
    // partial send silently clears whatever it left out.
    url: request.url,
    title: request.title,
    notes: request.notes,
    tags: request.tags,
    fields: request.fields,
    ...(request.imageUrl === undefined ? {} : { image_url: request.imageUrl }),
  });
}
