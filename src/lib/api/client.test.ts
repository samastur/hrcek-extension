import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { TokenAuth } from './auth';
import { HrcekClient } from './client';
import { HrcekApiError, HrcekNetworkError } from './errors';
import type { EntryOut } from './types';

const BASE = 'https://hrcek.test';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client() {
  return new HrcekClient(BASE, new TokenAuth('hrcek_abc'));
}

const ENTRY: EntryOut = {
  id: 1,
  url: 'https://example.com/watch',
  title: 'A watch',
  notes: '',
  tags: [],
  fields: {},
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

  it('login() posts identifier and password', async () => {
    server.use(
      http.post(`${BASE}/api/auth/login`, async ({ request }) => {
        expect(await request.json()).toEqual({
          identifier: 'nina@example.com',
          password: 's3cret',
        });
        return HttpResponse.json({ email: 'nina@example.com', display_name: null });
      }),
    );

    expect(await client().login('nina@example.com', 's3cret')).toEqual({
      email: 'nina@example.com',
      display_name: null,
    });
  });
});
