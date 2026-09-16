import { describe, expect, it } from 'vitest';
import { authForSettings } from './client-factory';
import { SessionAuth, TokenAuth } from './api/auth';

describe('authForSettings', () => {
  it('uses bearer auth in token mode', () => {
    const auth = authForSettings({
      serverUrl: 'https://h.example',
      authMode: 'token',
      token: 'hrcek_abc',
    });

    expect(auth).toBeInstanceOf(TokenAuth);
  });

  it('uses session auth in session mode', () => {
    const auth = authForSettings({
      serverUrl: 'https://h.example',
      authMode: 'session',
      token: null,
    });

    expect(auth).toBeInstanceOf(SessionAuth);
  });
});
