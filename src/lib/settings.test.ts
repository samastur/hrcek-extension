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
      token: 'hrcek_abc',
    });

    expect(await loadSettings()).toEqual({
      serverUrl: 'https://hrcek.example.com',
      token: 'hrcek_abc',
    });
  });

  it('normalizes the server URL on save', async () => {
    await saveSettings({
      serverUrl: '  https://hrcek.example.com//  ',
      token: null,
    });

    expect((await loadSettings())?.serverUrl).toBe('https://hrcek.example.com');
  });

  it('drops the authMode left by older versions', async () => {
    // Settings written before session auth was removed. Reading them must
    // not resurrect a mode this client no longer understands.
    await fakeBrowser.storage.local.set({
      settings: {
        serverUrl: 'https://hrcek.example.com',
        authMode: 'session',
        token: null,
      },
    });

    expect(await loadSettings()).toEqual({
      serverUrl: 'https://hrcek.example.com',
      token: null,
    });
  });
});

describe('normalizeServerUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeServerUrl(' https://h.example/ ')).toBe('https://h.example');
    expect(normalizeServerUrl('https://h.example')).toBe('https://h.example');
  });
});
