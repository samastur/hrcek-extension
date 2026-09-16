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

  it('answers by-url with the held entry, 404 with HRC-CORE-0003 otherwise', async () => {
    await post({ url: 'https://example.com/held' });
    const held = await fetch(
      `${fake.url}/api/entries/by-url/?url=${encodeURIComponent('https://example.com/held')}`,
      { headers: AUTH },
    );
    expect(held.status).toBe(200);
    expect((await held.json()).url).toBe('https://example.com/held');

    const missing = await fetch(
      `${fake.url}/api/entries/by-url/?url=${encodeURIComponent('https://example.com/no')}`,
      { headers: AUTH },
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('HRC-CORE-0003');
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
