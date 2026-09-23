import { describe, expect, it, vi } from 'vitest';
import en from './messages/en.json';
import { CATALOGUES, LOCALE_NAMES } from './catalogues';
import { createTranslator, resolveLocale } from './index';

describe('resolveLocale', () => {
  const available = ['en', 'sl'];

  it('takes the chosen language when there is a catalogue for it', () => {
    expect(resolveLocale('sl', 'en-GB', available)).toBe('sl');
  });

  it('falls back to the browser when the choice has no catalogue', () => {
    // A language typed into storage by hand, or one dropped in a later
    // version. The browser's own locale is the better guess.
    expect(resolveLocale('de', 'sl', available)).toBe('sl');
  });

  it('matches the browser locale by its base tag', () => {
    expect(resolveLocale(null, 'sl-SI', available)).toBe('sl');
  });

  it('prefers an exact match over the base tag', () => {
    expect(resolveLocale(null, 'sl-SI', ['en', 'sl-SI', 'sl'])).toBe('sl-SI');
  });

  it('answers English when nothing else fits', () => {
    expect(resolveLocale(null, 'fi', available)).toBe('en');
    expect(resolveLocale(null, '', available)).toBe('en');
  });
});

describe('createTranslator', () => {
  it('substitutes named placeholders', () => {
    const t = createTranslator('en');
    expect(t('options.connectedAs', { email: 'nina@example.com' })).toBe(
      'Connected as nina@example.com.',
    );
  });

  it('leaves an unknown placeholder standing rather than emptying it', () => {
    // A catalogue and a call site can disagree; showing {name} reports
    // the bug, showing nothing hides it.
    const t = createTranslator('en');
    expect(t('options.tokenCreated', {})).toContain('{name}');
  });

  it('falls back to English for a key a translation lacks', () => {
    const t = createTranslator('sl');
    const missing = (Object.keys(en) as (keyof typeof en)[]).filter(
      (key) => CATALOGUES['sl']![key] === undefined,
    );
    for (const key of missing) expect(t(key)).toBe(en[key]);
  });

  it('answers the key itself, loudly, when English lacks it too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = createTranslator('en');
    expect(t('popup.nothingIsCalledThis' as keyof typeof en)).toBe(
      'popup.nothingIsCalledThis',
    );
    expect(warn).toHaveBeenCalled();
  });
});

describe('the catalogues', () => {
  it('translate nothing English does not have', () => {
    const english = new Set(Object.keys(en));
    for (const [locale, messages] of Object.entries(CATALOGUES)) {
      for (const key of Object.keys(messages)) {
        expect(english.has(key), `${locale} has a key English lacks: ${key}`).toBe(true);
      }
    }
  });

  it('hold no empty message', () => {
    for (const [locale, messages] of Object.entries(CATALOGUES)) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value.trim().length, `${locale}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('say the two messages the client authors itself, in every language', () => {
    // These are the only person-facing strings not written by the
    // server: "could not reach it" and "the picture did not attach".
    // Both used to be hard-coded English inside lib/, which showed
    // through in the middle of an otherwise translated sentence.
    for (const [locale, messages] of Object.entries(CATALOGUES)) {
      const unreachable = messages['error.unreachable'];
      expect(unreachable, `${locale} cannot say the server is unreachable`).toBeTruthy();
      expect(unreachable, `${locale}.error.unreachable names no server`).toContain(
        '{server}',
      );
      expect(
        messages['error.pictureNotAttached'],
        `${locale} cannot say a picture did not attach`,
      ).toBeTruthy();
    }
  });

  it('name every language in its own words', () => {
    for (const locale of Object.keys(CATALOGUES)) {
      expect(LOCALE_NAMES[locale]).toBeTruthy();
    }
  });
});
