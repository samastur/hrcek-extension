import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FAKE_IDENTIFIER,
  FAKE_PASSWORD,
  FAKE_TOKEN,
  startFakeHrcek,
  type FakeHrcek,
} from './server';

let fake: FakeHrcek;

beforeAll(async () => {
  fake = await startFakeHrcek(0);
});
afterAll(async () => {
  await fake.close();
});
beforeEach(() => {
  fake.reset();
});

const AUTH = { Authorization: `Bearer ${FAKE_TOKEN}` };
const JSON_AUTH = { ...AUTH, 'Content-Type': 'application/json' };

async function post(body: unknown, headers: Record<string, string> = JSON_AUTH) {
  return fetch(`${fake.url}/api/entries/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** A read, but a POST: the address must not reach a query string. */
async function lookup(url: string) {
  return fetch(`${fake.url}/api/entries/lookup`, {
    method: 'POST',
    headers: JSON_AUTH,
    body: JSON.stringify({ url }),
  });
}

describe('fake hrcek', () => {
  it('reports health without credentials', async () => {
    const response = await fetch(`${fake.url}/api/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('ok');
  });

  it('rejects missing credentials with HRC-AUTH-0003', async () => {
    const response = await fetch(`${fake.url}/api/auth/me`);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('HRC-AUTH-0003');
  });

  it('creates then updates an entry, replace-except-fields', async () => {
    const created = await post({
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['watches'],
      fields: { price: '129.00' },
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.fields).toEqual({ Price: '129' });

    const updated = await post({ url: 'https://example.com/watch', title: 'Again' });
    expect(updated.status).toBe(200);
    const updatedBody = await updated.json();
    expect(updatedBody.id).toBe(createdBody.id);
    expect(updatedBody.notes).toBe(''); // replaced
    expect(updatedBody.tags).toEqual([]); // replaced
    expect(updatedBody.fields).toEqual({ Price: '129' }); // patched, survives
  });

  it('clears a field only when named with an empty string', async () => {
    await post({
      url: 'https://example.com/w',
      fields: { price: '10', priority: 'low' },
    });
    const response = await post({ url: 'https://example.com/w', fields: { price: '' } });
    expect((await response.json()).fields).toEqual({ Priority: 'low' });
  });

  it('matches addresses with trimmed whitespace and lowercased scheme/host', async () => {
    await post({ url: 'https://Example.COM/Watch' });
    const response = await post({ url: '  HTTPS://example.com/Watch  ' });
    expect(response.status).toBe(200); // same entry — updated, not created
  });

  it('answers 422 HRC-FIELD-0001 for an unknown field name', async () => {
    const response = await post({
      url: 'https://example.com/x',
      fields: { colour: 'red' },
    });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('HRC-FIELD-0001');
    expect(body.error.details).toEqual({ field: 'colour' });
  });

  it('answers 422 HRC-CORE-0002 for a bad value, keyed by owner spelling', async () => {
    const response = await post({
      url: 'https://example.com/x',
      fields: { priority: 'urgent' },
    });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('HRC-CORE-0002');
    expect(Object.keys(body.error.details.fields)).toEqual(['Priority']);
  });

  it('leaves a picture alone when image_url is omitted', async () => {
    const created = await post({
      url: 'https://example.com/pic',
      image_url: 'https://cdn.example.com/a.jpg',
    });

    // The image URL must name the entry that holds it. Reading the id
    // counter twice would give a new entry a URL for the next one.
    const createdBody = await created.json();
    expect(createdBody.image.url).toBe(`/entries/${createdBody.id}/image/`);

    // Like fields, and unlike every other attribute, an absent image_url
    // changes nothing — a client that predates pictures cannot strip one.
    const again = await post({ url: 'https://example.com/pic', title: 'Renamed' });

    const entry = await again.json();
    expect(entry.title).toBe('Renamed');
    expect(entry.image).not.toBeNull();
  });

  it('answers 404, never 403, for an image route on an entry nobody holds', async () => {
    // A 403 would tell you the entry exists.
    const response = await fetch(`${fake.url}/api/entries/999/image`, {
      method: 'POST',
      headers: AUTH,
    });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('HRC-CORE-0003');
  });

  it('answers 404 for a delete when there was no picture to remove', async () => {
    const created = await post({ url: 'https://example.com/no-pic' });
    const { id } = await created.json();

    const response = await fetch(`${fake.url}/api/entries/${id}/image`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('HRC-CORE-0003');
  });

  it('deletes a held picture with 204, and the entry then shows no image', async () => {
    const created = await post({
      url: 'https://example.com/has-pic',
      image_url: 'https://cdn.example.com/a.jpg',
    });
    const { id } = await created.json();

    const response = await fetch(`${fake.url}/api/entries/${id}/image`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(response.status).toBe(204);

    const held = await lookup('https://example.com/has-pic');
    expect((await held.json()).image).toBeNull();
  });

  it('answers a lookup with the held entry, 404 with HRC-CORE-0003 otherwise', async () => {
    await post({ url: 'https://example.com/held' });
    const held = await lookup('https://example.com/held');
    expect(held.status).toBe(200);
    expect((await held.json()).url).toBe('https://example.com/held');

    const missing = await lookup('https://example.com/no');
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('HRC-CORE-0003');
  });

  it('will not answer a lookup from a query string', async () => {
    // The route moved to a POST so addresses stay out of access logs. A
    // fake that still honoured the old shape would let a client regress
    // to it without a single test going red.
    await post({ url: 'https://example.com/held' });
    const query = encodeURIComponent('https://example.com/held');
    const response = await fetch(`${fake.url}/api/entries/by-url/?url=${query}`, {
      headers: AUTH,
    });

    expect(response.status).toBe(404);
  });

  it('logs in with cookies and enforces CSRF on session posts', async () => {
    const login = await fetch(`${fake.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: FAKE_IDENTIFIER, password: FAKE_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const cookies = login.headers.getSetCookie();
    expect(cookies.join(';')).toContain('sessionid=');
    expect(cookies.join(';')).toContain('csrftoken=');

    const sessionCookie = 'sessionid=fake-session; csrftoken=fake-csrf';
    const noCsrf = await post(
      { url: 'https://example.com/s' },
      { 'Content-Type': 'application/json', Cookie: sessionCookie },
    );
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.json()).error.code).toBe('HRC-AUTH-0005');

    const withCsrf = await post(
      { url: 'https://example.com/s' },
      {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'X-CSRFToken': 'fake-csrf',
      },
    );
    expect(withCsrf.status).toBe(201);
  });

  it('rejects a bad password with HRC-AUTH-0001', async () => {
    const login = await fetch(`${fake.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: FAKE_IDENTIFIER, password: 'wrong' }),
    });
    expect(login.status).toBe(401);
    expect((await login.json()).error.code).toBe('HRC-AUTH-0001');
  });
});

describe('token minting', () => {
  async function createToken(body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${fake.url}/api/auth/tokens/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('hands out a non-expiring token for good credentials', async () => {
    const response = await createToken({
      name: 'Hrček extension (Firefox on macOS)',
      identifier: FAKE_IDENTIFIER,
      password: FAKE_PASSWORD,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.name).toBe('Hrček extension (Firefox on macOS)');
    expect(body.expires_at).toBeNull();
    expect(body.token).toContain('hrcek_');
  });

  it('issues a token that then authenticates ordinary calls', async () => {
    const created = await (
      await createToken({
        name: 'client',
        identifier: FAKE_IDENTIFIER,
        password: FAKE_PASSWORD,
      })
    ).json();

    const response = await fetch(`${fake.url}/api/auth/me`, {
      headers: { Authorization: `Bearer ${created.token}` },
    });
    expect(response.status).toBe(200);
  });

  it('refuses bad credentials with HRC-AUTH-0001', async () => {
    const response = await createToken({
      name: 'client',
      identifier: FAKE_IDENTIFIER,
      password: 'wrong',
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('HRC-AUTH-0001');
  });

  it('ignores an Authorization header — the route reads credentials only', async () => {
    // auth=None on the real route: a token riding along says nothing
    // about who is asking, and must not change the answer either way.
    const response = await createToken(
      { name: 'client', identifier: FAKE_IDENTIFIER, password: FAKE_PASSWORD },
      { Authorization: `Bearer ${FAKE_TOKEN}` },
    );

    expect(response.status).toBe(201);
    expect((await response.json()).token).toContain('hrcek_');
  });

  it('requires a name, and one the column can hold', async () => {
    const blank = await createToken({
      name: '  ',
      identifier: FAKE_IDENTIFIER,
      password: FAKE_PASSWORD,
    });
    expect(blank.status).toBe(422);
    expect((await blank.json()).error.code).toBe('HRC-CORE-0002');

    const tooLong = await createToken({
      name: 'x'.repeat(51),
      identifier: FAKE_IDENTIFIER,
      password: FAKE_PASSWORD,
    });
    expect(tooLong.status).toBe(422);
  });
});

describe('fields and labels', () => {
  it('serves the account fields with their kinds and options', async () => {
    const response = await fetch(`${fake.url}/api/fields/`, { headers: AUTH });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        { name: 'Price', kind: 'number', options: [] },
        { name: 'Priority', kind: 'choice', options: ['high', 'medium', 'low'] },
      ],
      count: 2,
    });
  });

  it('lists only labels that some entry carries, ignoring capitals in the order', async () => {
    await post({ url: 'https://example.com/a', tags: ['Watches', 'diving'] });
    await post({ url: 'https://example.com/b', tags: ['aviation'] });

    const response = await fetch(`${fake.url}/api/labels/`, { headers: AUTH });
    expect(await response.json()).toEqual({
      items: [{ name: 'aviation' }, { name: 'diving' }, { name: 'Watches' }],
      count: 3,
    });
  });

  it('narrows by starts_with as a literal, and pages by after', async () => {
    await post({ url: 'https://example.com/c', tags: ['watches', 'water', 'wave'] });

    const narrowed = await fetch(`${fake.url}/api/labels/?starts_with=wat`, {
      headers: AUTH,
    });
    expect(await narrowed.json()).toEqual({
      items: [{ name: 'watches' }, { name: 'water' }],
      count: 2,
    });

    const paged = await fetch(`${fake.url}/api/labels/?starts_with=wat&after=watches`, {
      headers: AUTH,
    });
    // count is how many match, not how many this page carries.
    expect(await paged.json()).toEqual({ items: [{ name: 'water' }], count: 2 });
  });

  it('refuses a limit above a thousand rather than truncating silently', async () => {
    const response = await fetch(`${fake.url}/api/labels/?limit=5000`, { headers: AUTH });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('HRC-CORE-0002');
  });
});
