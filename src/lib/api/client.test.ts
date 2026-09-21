import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { HrcekClient } from './client';
import { HrcekApiError, HrcekNetworkError } from './errors';
import type { EntryOut } from './types';

const BASE = 'https://hrcek.test';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client() {
  return new HrcekClient(BASE, 'hrcek_abc');
}

const ENTRY: EntryOut = {
  id: 1,
  url: 'https://example.com/watch',
  title: 'A watch',
  notes: '',
  tags: [],
  fields: {},
  image: null,
  created_at: '2026-09-13T12:28:12.937Z',
  updated_at: '2026-09-13T12:28:12.937Z',
};

describe('HrcekClient', () => {
  it('me() sends the bearer token and parses the user', async () => {
    server.use(
      http.get(`${BASE}/api/auth/me`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer hrcek_abc');
        return HttpResponse.json({ email: 'nina@example.com', display_name: null });
      }),
    );

    expect(await client().me()).toEqual({
      email: 'nina@example.com',
      display_name: null,
    });
  });

  it('never sends cookies — the token is the only credential', async () => {
    server.use(
      http.get(`${BASE}/api/auth/me`, () =>
        HttpResponse.json({ email: 'nina@example.com', display_name: null }),
      ),
    );

    let seen: RequestCredentials | undefined;
    const spy: typeof fetch = (input, init) => {
      seen = init?.credentials;
      return fetch(input as string, init);
    };

    await new HrcekClient(BASE, 'hrcek_abc', spy).me();
    expect(seen).toBe('omit');
  });

  it('saveEntry() distinguishes created from updated by status code', async () => {
    server.use(
      http.post(`${BASE}/api/entries/`, () => HttpResponse.json(ENTRY, { status: 201 })),
    );
    expect(await client().saveEntry({ url: ENTRY.url })).toEqual({
      status: 'created',
      entry: ENTRY,
    });

    server.use(
      http.post(`${BASE}/api/entries/`, () => HttpResponse.json(ENTRY, { status: 200 })),
    );
    expect(await client().saveEntry({ url: ENTRY.url })).toEqual({
      status: 'updated',
      entry: ENTRY,
    });
  });

  it('getEntryByUrl() url-encodes the address as a query parameter', async () => {
    server.use(
      http.get(`${BASE}/api/entries/by-url/`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('url')).toBe('https://example.com/a?b=c&d=e');
        return HttpResponse.json(ENTRY);
      }),
    );

    expect(await client().getEntryByUrl('https://example.com/a?b=c&d=e')).toEqual(ENTRY);
  });

  it('throws HrcekApiError with the server code on failure', async () => {
    server.use(
      http.get(`${BASE}/api/entries/by-url/`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'HRC-CORE-0003',
              message: 'The requested resource does not exist.',
              details: { url: 'https://example.com/nothing' },
            },
          },
          { status: 404 },
        ),
      ),
    );

    const error = await client()
      .getEntryByUrl('https://example.com/nothing')
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(HrcekApiError);
    expect((error as HrcekApiError).code).toBe('HRC-CORE-0003');
    expect((error as HrcekApiError).status).toBe(404);
  });

  it('wraps connection failures in HrcekNetworkError', async () => {
    server.use(http.get(`${BASE}/api/health`, () => HttpResponse.error()));

    const error = await client()
      .health()
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(HrcekNetworkError);
  });

  it('listFields() returns the page items', async () => {
    server.use(
      http.get(`${BASE}/api/fields/`, () =>
        HttpResponse.json({
          items: [
            { name: 'Price', kind: 'number', options: [] },
            { name: 'Priority', kind: 'choice', options: ['high', 'medium', 'low'] },
          ],
          count: 2,
        }),
      ),
    );

    const fields = await client().listFields();
    expect(fields.map((f) => f.name)).toEqual(['Price', 'Priority']);
    expect(fields[1]!.options).toEqual(['high', 'medium', 'low']);
  });

  it('listLabels() passes starts_with through as a literal', async () => {
    server.use(
      http.get(`${BASE}/api/labels/`, ({ request }) => {
        // A literal, not a pattern: punctuation somebody typed means itself.
        expect(new URL(request.url).searchParams.get('starts_with')).toBe('c++');
        return HttpResponse.json({ items: [{ name: 'c++' }], count: 1 });
      }),
    );

    expect(await client().listLabels({ startsWith: 'c++' })).toEqual([{ name: 'c++' }]);
  });

  it('listLabels() sends no empty parameters when asked plainly', async () => {
    server.use(
      http.get(`${BASE}/api/labels/`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        expect(query.has('starts_with')).toBe(false);
        expect(query.has('after')).toBe(false);
        return HttpResponse.json({ items: [], count: 0 });
      }),
    );

    expect(await client().listLabels()).toEqual([]);
  });
});

describe('createToken', () => {
  const CREATED = {
    id: 4,
    name: 'Hrček extension (Firefox on macOS)',
    token: 'hrcek_new_token',
    created_at: '2026-09-20T09:12:44.201Z',
    expires_at: null,
  };

  it('posts the name and credentials, and omits expires_at so the token lasts', async () => {
    server.use(
      http.post(`${BASE}/api/auth/tokens/exchange`, async ({ request }) => {
        expect(await request.json()).toEqual({
          name: 'Hrček extension (Firefox on macOS)',
          identifier: 'nina@example.com',
          password: 's3cret',
        });
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );

    const created = await new HrcekClient(BASE, null).createToken(
      'Hrček extension (Firefox on macOS)',
      'nina@example.com',
      's3cret',
    );
    expect(created.token).toBe('hrcek_new_token');
    expect(created.expires_at).toBeNull();
  });

  it('sends no Authorization header — minting is credential-based, not token-based', async () => {
    server.use(
      http.post(`${BASE}/api/auth/tokens/exchange`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBeNull();
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );

    // The route reads no session and needs no token. A stale or revoked
    // token in settings must not ride along and colour the answer.
    await new HrcekClient(BASE, 'hrcek_stale').createToken('n', 'nina@example.com', 'p');
  });

  it('keeps the status when the throttle answers outside the error envelope', async () => {
    // The route is rate-limited (ten an hour by default) and ninja's
    // throttle reply is not the Hrček envelope, so only the status is
    // dependable — the UI branches on it.
    server.use(
      http.post(`${BASE}/api/auth/tokens/exchange`, () =>
        HttpResponse.json({ detail: 'Too many requests.' }, { status: 429 }),
      ),
    );

    const error = await new HrcekClient(BASE, null)
      .createToken('n', 'nina@example.com', 'p')
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect((error as HrcekApiError).status).toBe(429);
  });

  it('surfaces bad credentials as HRC-AUTH-0001', async () => {
    server.use(
      http.post(`${BASE}/api/auth/tokens/exchange`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'HRC-AUTH-0001',
              message: 'Those credentials are not valid.',
              details: {},
            },
          },
          { status: 401 },
        ),
      ),
    );

    const error = await new HrcekClient(BASE, null)
      .createToken('n', 'nina@example.com', 'wrong')
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect((error as HrcekApiError).code).toBe('HRC-AUTH-0001');
  });
});
