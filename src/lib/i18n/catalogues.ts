import en from './messages/en.json';
import sl from './messages/sl.json';

/** Every key the extension can say. English is the one complete catalogue. */
export type MessageKey = keyof typeof en;

/** A translation may be partial; a missing key falls back to English. */
export type Catalogue = Partial<Record<MessageKey, string>>;

export const DEFAULT_LOCALE = 'en';

/**
 * Adding a language is one JSON file and one line here. Nothing else in
 * the codebase learns about it — not even the server, which falls back
 * to English on its own for a language it does not carry.
 */
export const CATALOGUES: Record<string, Catalogue> = { en, sl };

/**
 * What each language calls itself. The only naming that helps somebody
 * who has landed in a language they cannot read.
 */
export const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  sl: 'Slovenščina',
};
