import { describe, expect, it, vi } from 'vitest';
import { SessionAuth, TokenAuth } from './auth';

describe('TokenAuth', () => {
  it('sends the bearer token on every method and no cookies', async () => {
    const auth = new TokenAuth('hrcek_abc');

    expect(await auth.headers('GET')).toEqual({ Authorization: 'Bearer hrcek_abc' });
    expect(await auth.headers('POST')).toEqual({ Authorization: 'Bearer hrcek_abc' });
    expect(auth.credentials).toBe('omit');
  });
});

describe('SessionAuth', () => {
  it('includes cookies and sends no extra headers on safe methods', async () => {
    const getCsrfToken = vi.fn();
    const auth = new SessionAuth(getCsrfToken);

    expect(await auth.headers('GET')).toEqual({});
    expect(getCsrfToken).not.toHaveBeenCalled();
    expect(auth.credentials).toBe('include');
  });

  it('sends X-CSRFToken on unsafe methods', async () => {
    const auth = new SessionAuth(async () => 'csrf-123');

    expect(await auth.headers('POST')).toEqual({ 'X-CSRFToken': 'csrf-123' });
  });

  it('omits the header when no CSRF token is available', async () => {
    const auth = new SessionAuth(async () => null);

    expect(await auth.headers('POST')).toEqual({});
  });
});
