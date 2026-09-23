// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// The settings page is now built by render(), which runs after the
// storage read. Mocked to refuse, which is the case that used to leave
// the page empty.
vi.mock('../../lib/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/settings')>();
  return {
    ...actual,
    loadSettings: vi.fn(async () => {
      throw new Error('storage is unavailable');
    }),
  };
});

describe('the settings page', () => {
  it('renders itself even when the stored settings cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    document.body.innerHTML = '<div id="app"></div>';

    await import('./main');

    // A blank settings page is one nobody can fix anything from — least
    // of all whatever stopped the read.
    await vi.waitFor(() => {
      expect(document.querySelector('#settings-form')).not.toBeNull();
    });
    expect(document.querySelector('#server-url')).not.toBeNull();
    expect(document.querySelector('#token')).not.toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
