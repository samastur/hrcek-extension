import { browser } from 'wxt/browser';
import en from './messages/en.json';
import {
  CATALOGUES,
  DEFAULT_LOCALE,
  type Catalogue,
  type MessageKey,
} from './catalogues';

export type { MessageKey } from './catalogues';

/** Says one thing, in one language. Handed down; never a global. */
export type Translator = (key: MessageKey, params?: Record<string, string>) => string;

export function availableLocales(): string[] {
  return Object.keys(CATALOGUES);
}

/**
 * The language to speak. A choice wins when there is a catalogue for it;
 * otherwise the browser's own locale, exactly and then by its base tag
 * ("sl-SI" is a Slovenian browser); otherwise English.
 */
export function resolveLocale(
  chosen: string | null,
  uiLocale: string,
  available: string[] = availableLocales(),
): string {
  if (chosen !== null && available.includes(chosen)) return chosen;
  if (available.includes(uiLocale)) return uiLocale;
  const base = uiLocale.split('-')[0] ?? '';
  if (available.includes(base)) return base;
  return DEFAULT_LOCALE;
}

/** The browser's own language, or English where it cannot be read. */
function uiLocale(): string {
  try {
    return browser.i18n.getUILanguage();
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** `resolveLocale` against this browser. The one call that needs an API. */
export function localeFor(chosen: string | null): string {
  return resolveLocale(chosen, uiLocale());
}

function substitute(template: string, params: Record<string, string>): string {
  // Only the placeholders the caller supplied are replaced. One it did
  // not supply is left standing: {name} in the UI reports the bug, an
  // empty space hides it.
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? (params[name] as string) : whole,
  );
}

export function createTranslator(locale: string): Translator {
  const catalogue: Catalogue = CATALOGUES[locale] ?? {};
  const english = en as Record<string, string>;

  return (key, params = {}) => {
    const template = catalogue[key] ?? english[key];
    if (template === undefined) {
      // English is the source of truth; a key missing from it is a
      // programming error, not a translation gap.
      console.warn(`[hrcek] no message for "${key}"`);
      return key;
    }
    return substitute(template, params);
  };
}
