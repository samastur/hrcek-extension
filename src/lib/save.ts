import type { HrcekClient, SaveResult } from './api/client';
import { HrcekApiError } from './api/errors';
import type { EntryOut } from './api/types';

export interface SaveRequest {
  url: string;
  title: string;
  notes: string;
  tags: string[];
  fields: Record<string, string>;
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
    url: request.url,
    title: request.title,
    notes: request.notes,
    tags: request.tags,
    fields: request.fields,
  });
}
