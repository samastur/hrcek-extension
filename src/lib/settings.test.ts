import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadSettings, normalizeServerUrl, saveSettings } from './settings';

describe('settings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns null when never configured', async () => {
    expect(await loadSettings()).toBeNull();
  });

  it('round-trips settings through storage.local', async () => {
    await saveSettings({
      serverUrl: 'https://hrcek.example.com',
      authMode: 'token',
      token: 'hrcek_abc',
    });

    expect(await loadSettings()).toEqual({
      serverUrl: 'https://hrcek.example.com',
      authMode: 'token',
      token: 'hrcek_abc',
    });
  });

  it('normalizes the server URL on save', async () => {
    await saveSettings({
      serverUrl: '  https://hrcek.example.com//  ',
      authMode: 'session',
      token: null,
    });

    expect((await loadSettings())?.serverUrl).toBe('https://hrcek.example.com');
  });
});

describe('normalizeServerUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeServerUrl(' https://h.example/ ')).toBe('https://h.example');
    expect(normalizeServerUrl('https://h.example')).toBe('https://h.example');
  });
});
