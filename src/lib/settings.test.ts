import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { isConfigured, loadSettings, normalizeServerUrl, saveSettings } from './settings';

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
      showSavedState: true,
      language: null,
    });

    expect(await loadSettings()).toEqual({
      serverUrl: 'https://hrcek.example.com',
      token: 'hrcek_abc',
      showSavedState: true,
      language: null,
    });
  });

  it('normalizes the server URL on save', async () => {
    await saveSettings({
      serverUrl: '  https://hrcek.example.com//  ',
      token: null,
      showSavedState: true,
      language: null,
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
      showSavedState: true,
      language: null,
    });
  });

  it('shows the saved state by default, including in settings written before the switch existed', async () => {
    await fakeBrowser.storage.local.set({
      settings: { serverUrl: 'https://hrcek.example.com', token: 'hrcek_abc' },
    });

    expect((await loadSettings())?.showSavedState).toBe(true);
  });

  it('keeps the switch off once it has been turned off', async () => {
    await saveSettings({
      serverUrl: 'https://hrcek.example.com',
      token: 'hrcek_abc',
      showSavedState: false,
      language: null,
    });

    expect((await loadSettings())?.showSavedState).toBe(false);
  });

  it('round-trips a chosen language', async () => {
    await saveSettings({
      serverUrl: 'https://hrcek.example.com',
      token: 'hrcek_abc',
      showSavedState: true,
      language: 'sl',
    });

    expect((await loadSettings())?.language).toBe('sl');
  });

  it('reads settings written before the choice existed as Automatic', async () => {
    // Automatic is what those users already have: the browser's language.
    await fakeBrowser.storage.local.set({
      settings: { serverUrl: 'https://hrcek.example.com', token: 'hrcek_abc' },
    });

    expect((await loadSettings())?.language).toBeNull();
  });
});

describe('isConfigured', () => {
  it('says no to a fresh install', () => {
    expect(isConfigured(null)).toBe(false);
  });

  it('says no to a server address saved before a token was minted', () => {
    // The documented first-run order — the mint panel sits below the
    // Save button. Whoever asks must not mistake this for a token the
    // server refused: there is no token to refuse.
    expect(
      isConfigured({
        serverUrl: 'https://hrcek.example.com',
        token: null,
        showSavedState: true,
        language: null,
      }),
    ).toBe(false);
  });

  it('says yes once there is a token', () => {
    expect(
      isConfigured({
        serverUrl: 'https://hrcek.example.com',
        token: 'hrcek_abc',
        showSavedState: true,
        language: null,
      }),
    ).toBe(true);
  });
});

describe('normalizeServerUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeServerUrl(' https://h.example/ ')).toBe('https://h.example');
    expect(normalizeServerUrl('https://h.example')).toBe('https://h.example');
  });
});
