import { describe, expect, it, vi } from 'vitest';
import type { HrcekClient } from './api/client';
import { HrcekApiError } from './api/errors';
import { loadExisting, submitSave } from './save';
import type { EntryOut } from './api/types';

const ENTRY: EntryOut = {
  id: 1,
  url: 'https://example.com/watch',
  title: 'A watch',
  notes: '',
  tags: [],
  fields: { Price: '129' },
  image: null,
  created_at: '2026-09-13T12:28:12.937Z',
  updated_at: '2026-09-13T12:28:12.937Z',
};

describe('loadExisting', () => {
  it('returns the entry when the address is already held', async () => {
    const client = {
      getEntryByUrl: vi.fn().mockResolvedValue(ENTRY),
    } as unknown as HrcekClient;

    expect(await loadExisting(client, ENTRY.url)).toEqual(ENTRY);
  });

  it('returns null on HRC-CORE-0003 (not held)', async () => {
    const client = {
      getEntryByUrl: vi
        .fn()
        .mockRejectedValue(new HrcekApiError(404, 'HRC-CORE-0003', 'not there')),
    } as unknown as HrcekClient;

    expect(await loadExisting(client, 'https://example.com/nothing')).toBeNull();
  });

  it('rethrows any other failure', async () => {
    const client = {
      getEntryByUrl: vi
        .fn()
        .mockRejectedValue(new HrcekApiError(401, 'HRC-AUTH-0003', 'sign in')),
    } as unknown as HrcekClient;

    await expect(loadExisting(client, ENTRY.url)).rejects.toMatchObject({
      code: 'HRC-AUTH-0003',
    });
  });
});

describe('submitSave', () => {
  it('posts the whole entry through the client', async () => {
    const saveEntry = vi.fn().mockResolvedValue({ status: 'created', entry: ENTRY });
    const client = { saveEntry } as unknown as HrcekClient;

    const outcome = await submitSave(client, {
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['watches'],
      fields: { price: '129.00' },
    });

    expect(saveEntry).toHaveBeenCalledWith({
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['watches'],
      fields: { price: '129.00' },
    });
    expect(outcome).toEqual({ status: 'created', entry: ENTRY });
  });

  it('omits image_url entirely when the picture did not change', async () => {
    // Leaving image_url out is documented as changing nothing; sending
    // null or "" is not the same thing at all.
    const saveEntry = vi.fn().mockResolvedValue({ status: 'updated', entry: ENTRY });
    const client = { saveEntry } as unknown as HrcekClient;

    await submitSave(client, {
      url: 'https://example.com/watch',
      title: '',
      notes: '',
      tags: [],
      fields: {},
    });

    expect('image_url' in saveEntry.mock.calls[0]![0]).toBe(false);
  });

  it('sends image_url when an address was chosen and the bytes could not be read', async () => {
    const saveEntry = vi.fn().mockResolvedValue({ status: 'updated', entry: ENTRY });
    const client = { saveEntry } as unknown as HrcekClient;

    await submitSave(client, {
      url: 'https://example.com/watch',
      title: '',
      notes: '',
      tags: [],
      fields: {},
      imageUrl: 'https://cdn.example.com/watch.jpg',
    });

    expect(saveEntry.mock.calls[0]![0].image_url).toBe(
      'https://cdn.example.com/watch.jpg',
    );
  });

  it('sends title, notes and tags in full, because POST replaces', async () => {
    // A partial send silently clears whatever it left out.
    const saveEntry = vi.fn().mockResolvedValue({ status: 'updated', entry: ENTRY });
    const client = { saveEntry } as unknown as HrcekClient;

    await submitSave(client, {
      url: 'https://example.com/watch',
      title: 'A watch, revisited',
      notes: '38mm',
      tags: ['diving'],
      fields: { Price: '129' },
    });

    expect(saveEntry).toHaveBeenCalledWith({
      url: 'https://example.com/watch',
      title: 'A watch, revisited',
      notes: '38mm',
      tags: ['diving'],
      fields: { Price: '129' },
    });
  });
});
