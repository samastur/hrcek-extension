import { describe, expect, it, vi } from 'vitest';
import { attachPicture, fetchPictureBytes, MAX_PICTURE_BYTES } from './picture';
import { HrcekApiError } from './api/errors';
import type { EntryOut } from './api/types';

const ENTRY: EntryOut = {
  id: 7,
  url: 'https://example.com/watch',
  title: '',
  notes: '',
  tags: [],
  fields: {},
  image: null,
  created_at: '2026-09-13T12:28:12.937Z',
  updated_at: '2026-09-13T12:28:12.937Z',
};

/**
 * What the caller would say in the interface language. Deliberately not
 * English: the point of the parameter is that this file does not choose
 * the words.
 */
const FALLBACK = 'Slike ni bilo mogoče priložiti.';

function blob(size: number, type = 'image/jpeg') {
  return new Blob([new Uint8Array(size)], { type });
}

describe('fetchPictureBytes', () => {
  it('answers the bytes when the origin is reachable', async () => {
    const fetchFn = vi.fn(async () => new Response(blob(64))) as unknown as typeof fetch;
    const bytes = await fetchPictureBytes('https://cdn.test/a.jpg', fetchFn);
    expect(bytes?.size).toBe(64);
  });

  it('answers null when the origin refuses, so the address can stand in', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('blocked');
    }) as unknown as typeof fetch;
    expect(await fetchPictureBytes('https://cdn.test/a.jpg', fetchFn)).toBeNull();
  });

  it('answers null for something too large to upload', async () => {
    const fetchFn = vi.fn(
      async () => new Response(blob(MAX_PICTURE_BYTES + 1)),
    ) as unknown as typeof fetch;
    // Falls through to image_url rather than failing the save.
    expect(await fetchPictureBytes('https://cdn.test/huge.jpg', fetchFn)).toBeNull();
  });

  it('answers null for an SVG, which the server refuses', async () => {
    const fetchFn = vi.fn(
      async () => new Response(blob(64, 'image/svg+xml')),
    ) as unknown as typeof fetch;
    expect(await fetchPictureBytes('https://cdn.test/a.svg', fetchFn)).toBeNull();
  });

  it('answers null for an empty body', async () => {
    const fetchFn = vi.fn(async () => new Response(blob(0))) as unknown as typeof fetch;
    expect(await fetchPictureBytes('https://cdn.test/empty.jpg', fetchFn)).toBeNull();
  });
});

describe('attachPicture', () => {
  it('does nothing at all when the picture did not change', async () => {
    const client = { uploadImage: vi.fn(), deleteImage: vi.fn() };
    expect(
      await attachPicture(client as never, ENTRY, { kind: 'unchanged' }, null, FALLBACK),
    ).toBeNull();
    expect(client.uploadImage).not.toHaveBeenCalled();
    expect(client.deleteImage).not.toHaveBeenCalled();
  });

  it('uploads the bytes when there are any', async () => {
    const client = { uploadImage: vi.fn(async () => ENTRY), deleteImage: vi.fn() };
    const bytes = blob(32);
    expect(
      await attachPicture(
        client as never,
        ENTRY,
        { kind: 'url', url: 'https://cdn.test/a.jpg' },
        bytes,
        FALLBACK,
      ),
    ).toBeNull();
    expect(client.uploadImage).toHaveBeenCalledWith(7, bytes, 'a.jpg');
  });

  it('leaves the server to fetch the address when there are no bytes', async () => {
    // The entry POST already carried image_url in that case, so there is
    // nothing left to do here.
    const client = { uploadImage: vi.fn(), deleteImage: vi.fn() };
    expect(
      await attachPicture(
        client as never,
        ENTRY,
        { kind: 'url', url: 'https://cdn.test/a.jpg' },
        null,
        FALLBACK,
      ),
    ).toBeNull();
    expect(client.uploadImage).not.toHaveBeenCalled();
  });

  it('deletes the picture when none was chosen and the entry had one', async () => {
    const client = { uploadImage: vi.fn(), deleteImage: vi.fn(async () => undefined) };
    const held = { ...ENTRY, image: { url: '/entries/7/image/', width: 12, height: 8 } };
    expect(
      await attachPicture(client as never, held, { kind: 'none' }, null, FALLBACK),
    ).toBeNull();
    expect(client.deleteImage).toHaveBeenCalledWith(7);
  });

  it('does not delete when there was nothing to delete', async () => {
    const client = { uploadImage: vi.fn(), deleteImage: vi.fn() };
    await attachPicture(client as never, ENTRY, { kind: 'none' }, null, FALLBACK);
    expect(client.deleteImage).not.toHaveBeenCalled();
  });

  it('reports a failed upload without failing the entry', async () => {
    // Losing the entry because a thumbnail 404'd would be absurd.
    const client = {
      uploadImage: vi.fn(async () => {
        throw new HrcekApiError(
          422,
          'HRC-CORE-0002',
          'That is not an image Hrček can read.',
        );
      }),
      deleteImage: vi.fn(),
    };
    const message = await attachPicture(
      client as never,
      ENTRY,
      { kind: 'url', url: 'https://cdn.test/a.jpg' },
      blob(32),
      FALLBACK,
    );
    expect(message).toBe('That is not an image Hrček can read.');
  });

  it('says what the caller told it to say for a failure that is neither', async () => {
    // A raw runtime message ("Failed to fetch", a bug's TypeError) is
    // developer-facing and untranslated — show the caller's fallback
    // instead, which is the one that ends up inside the translated
    // "Saved, but the picture could not be attached: …" sentence.
    const client = {
      uploadImage: vi.fn(async () => {
        throw new Error('unexpected');
      }),
      deleteImage: vi.fn(),
    };
    const message = await attachPicture(
      client as never,
      ENTRY,
      { kind: 'url', url: 'https://cdn.test/a.jpg' },
      blob(32),
      FALLBACK,
    );
    expect(message).toBe(FALLBACK);
  });
});
