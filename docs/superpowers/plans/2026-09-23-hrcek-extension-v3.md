# Hrček extension v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Hrček extension that speaks the language its user chose, closes its own popup and confirms on the page, reports the failures a person can act on, and runs verified on Chrome as well as Firefox.

**Architecture:** A runtime message catalogue in `src/lib/i18n/` replaces hard-coded English everywhere and supplies the `Accept-Language` header the API client now sends. The popup finishes its own save — including the picture upload, whose bytes cannot cross Chrome's JSON-only message boundary — then injects a shadow-DOM toast into the page and closes itself. Failures that a person can act on grow a visible home: a banner for unreadable fields, and a latched "sign in again" state driven by 401/403. The badge's cache moves behind a store interface backed by `storage.session`, so Chrome's MV3 worker can die without costing a round of requests.

**Tech Stack:** TypeScript, WXT 0.21 (MV2 Firefox, MV3 Chrome), Vitest + msw + `wxt/testing/fake-browser`, Playwright against the in-repo fake Hrček.

**Spec:** `docs/superpowers/specs/2026-09-23-hrcek-extension-v3-design.md`

## Global Constraints

- **`src/lib/` never imports from `src/entrypoints/`.** Entrypoints are thin DOM wiring; reusable logic lives in `lib/`.
- **Browser-specific code climbs the ladder, lowest rung that works:** (1) manifest config in `wxt.config.ts`; (2) `import.meta.env.*` build-time switches; (3) a module in `src/lib/platform/` behind a shared interface; (4) per-browser entrypoints.
- `src/lib/api/types.gen.ts` is generated — never edit by hand.
- **Branch on the server's error `code`, never on `message`.** Messages are translated and may be reworded. Show `message` to people.
- **Never hard-code field names.** `Price`/`Priority` are one account's defaults.
- The API token lives in `browser.storage.local` only, never `storage.sync`. The password is never persisted. `credentials: 'omit'` everywhere; no `cookies` permission; no session auth.
- **Test files never live directly under `src/entrypoints/`** — every file there is an entrypoint to WXT and would ship inside the zip. Entrypoint tests go in `tests/entrypoints/`.
- `pnpm typecheck && pnpm lint && pnpm test` must pass before every commit; `.githooks/pre-commit` enforces it. **Never commit with `--no-verify`.**
- **Commit messages carry no AI trailers** — no `Co-Authored-By`, no generated-with footer. Subject style follows the repo: `feat:`, `fix:`, `test:`, `docs:`, lowercase, describing the behaviour.
- Every user-visible string added after Task 2 goes into the catalogue. A literal English string in `src/entrypoints/` is a review failure.

---

## File Structure

**Created:**

| File                                             | Responsibility                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `src/lib/i18n/messages/en.json`                  | The source of truth: every message key, in English                 |
| `src/lib/i18n/messages/sl.json`                  | Slovenian; a partial catalogue is legal                            |
| `src/lib/i18n/catalogues.ts`                     | The registry: locale tag → catalogue, and each language's own name |
| `src/lib/i18n/index.ts`                          | `resolveLocale`, `createTranslator`, `localeFor`, `Translator`     |
| `src/lib/i18n/index.test.ts`                     | Resolution, substitution, fallback, catalogue completeness         |
| `src/lib/platform/session-store.ts`              | `StateStore` over `storage.session`, in-memory where absent        |
| `src/lib/platform/session-store.test.ts`         | Round-trip and the absent-API fallback                             |
| `src/lib/page/toast-client.ts`                   | `showToast(tabId, text, kind)` — inject and message, never throw   |
| `src/entrypoints/toast.ts`                       | The in-page toast: shadow root, text, dismissal                    |
| `tests/entrypoints/toast.test.ts`                | The toast's DOM behaviour                                          |
| `docs/reports/2026-09-23-chrome-verification.md` | What real Chrome does with the manifest                            |
| `docs/store/permissions.md`                      | A justification per permission, for review                         |
| `docs/store/privacy.md`                          | What leaves the browser, and where it goes                         |

**Modified:**

| File                              | Change                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| `tsconfig.json`                   | `resolveJsonModule`, so catalogues can be JSON             |
| `src/lib/api/errors.ts`           | `isAuthFailure(error)`                                     |
| `src/lib/api/client.ts`           | Optional `acceptLanguage`, sent as a header                |
| `src/lib/client-factory.ts`       | Both factories take the resolved locale                    |
| `src/lib/settings.ts`             | `language: string \| null`                                 |
| `src/lib/saved-state.ts`          | `Answer` union, the unauthorized latch, injected store     |
| `src/lib/icon.ts`                 | `setTitle`                                                 |
| `src/lib/platform/action.ts`      | `setTitle` on the `ToolbarAction` interface                |
| `src/entrypoints/options/main.ts` | Language selector, every string translated                 |
| `src/entrypoints/popup/main.ts`   | Translation, auto-close, fields banner, unauthorized state |
| `src/entrypoints/popup/picker.ts` | Takes a translator                                         |
| `src/entrypoints/popup/chips.ts`  | Takes a translator; warns on suggestion failure            |
| `src/entrypoints/popup/style.css` | The `.trouble` note                                        |
| `src/entrypoints/background.ts`   | Unauthorized state, toolbar title, cache reset             |
| `src/lib/page/harvest-client.ts`  | Warns on failure                                           |
| `tests/fake-hrcek/server.ts`      | Honours `Accept-Language` for one error                    |
| `tests/e2e/save-flow.spec.ts`     | Auto-close, toast, language, fields banner                 |
| `package.json`                    | `zip:chrome`                                               |
| `wxt.config.ts`                   | Whatever Task 1 finds                                      |
| `README.md`, `CLAUDE.md`          | Chrome, languages, the new commands                        |

---

## Task 1: Verify what real Chrome does with the manifest

The whole runtime-origin design rests on Chrome accepting
`optional_host_permissions: ['<all_urls>']`. Everything else in this
plan is cheap to change; this is not. Find out first.

**Files:**

- Create: `docs/reports/2026-09-23-chrome-verification.md`
- Modify (only if the finding demands it): `wxt.config.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: a documented yes/no on `optional_host_permissions`, which Task 12 quotes in `docs/store/permissions.md`.

- [ ] **Step 1: Build the Chrome target**

```bash
pnpm build:chrome
cat .output/chrome-mv3/manifest.json
```

Expected: `manifest_version: 3`, `optional_host_permissions: ["<all_urls>"]`, `permissions` holding `activeTab`, `storage`, `tabs`, `scripting`, and **no** `host_permissions` key.

- [ ] **Step 2: Load it in a real Chrome and read the errors**

Open `chrome://extensions`, turn on Developer mode, "Load unpacked",
select `.output/chrome-mv3`. Then look at three things and write down
what each says:

1. Any red "Errors" button on the extension card — click it and copy the text.
2. The extension's "Details" → "Site access" section.
3. `chrome://extensions/?errors=<extension id>`, for warnings that did not surface on the card.

- [ ] **Step 3: Exercise the origin request**

Open the options page from the extension card, enter a server address
(`http://127.0.0.1:8787` is fine — nothing needs to answer), and press
Save. A Chrome permission prompt naming that origin must appear.

Expected: the prompt appears and, on accept, the status line says
`Saved.` without the "Site access was declined" tail. If no prompt
appears, or the status always reports a decline, the optional-permission
route does not work as designed — that is the finding.

- [ ] **Step 4: Write the report**

Create `docs/reports/2026-09-23-chrome-verification.md` with, in prose:
the Chrome version tested, the exact manifest keys as built, what each
of the three error surfaces said, whether the origin prompt appeared and
what accepting it did, and a one-line verdict: **the optional host
permission works / does not work**. If it does not, state what Chrome
demands instead — most likely a literal `host_permissions` entry — and
stop to raise it before any later task assumes otherwise.

- [ ] **Step 5: Commit**

```bash
git add docs/reports/2026-09-23-chrome-verification.md wxt.config.ts
git commit -m "docs: record what real Chrome makes of the manifest"
```

---

## Task 2: The message catalogue

**Files:**

- Create: `src/lib/i18n/messages/en.json`, `src/lib/i18n/messages/sl.json`, `src/lib/i18n/catalogues.ts`, `src/lib/i18n/index.ts`
- Test: `src/lib/i18n/index.test.ts`
- Modify: `tsconfig.json`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type MessageKey = keyof typeof en`
  - `type Translator = (key: MessageKey, params?: Record<string, string>) => string`
  - `resolveLocale(chosen: string | null, uiLocale: string, available?: string[]): string`
  - `createTranslator(locale: string): Translator`
  - `localeFor(chosen: string | null): string` — resolution against the browser's UI locale
  - `availableLocales(): string[]`
  - `CATALOGUES: Record<string, Catalogue>`, `LOCALE_NAMES: Record<string, string>`, `DEFAULT_LOCALE = 'en'`

- [ ] **Step 1: Let TypeScript import JSON**

`tsconfig.json` — add one option:

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": [".wxt/wxt.d.ts", "src", "tests", "*.ts"]
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/i18n/index.test.ts`:

```ts
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

  it('name every language in its own words', () => {
    for (const locale of Object.keys(CATALOGUES)) {
      expect(LOCALE_NAMES[locale]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm vitest run src/lib/i18n/index.test.ts`
Expected: FAIL — `Cannot find module './catalogues'`.

- [ ] **Step 4: Write the English catalogue**

Create `src/lib/i18n/messages/en.json`. This is the whole vocabulary the
extension needs; later tasks spend it rather than adding to it.

```json
{
  "error.somethingWrong": "Something went wrong.",

  "toolbar.name": "Hrček",
  "toolbar.signInAgain": "Hrček: sign in again",

  "options.heading": "Settings",
  "options.serverUrl": "Server address",
  "options.token": "API token",
  "options.language": "Language",
  "options.languageAutomatic": "Automatic ({language})",
  "options.showSaved": "Show whether a page is already saved",
  "options.showSavedHelp": "The toolbar ticks the hamster on pages you have saved. Doing so asks your Hrček about every address you visit. Turn it off and the toolbar only says whether the extension is configured.",
  "options.pasteBefore": "Paste one from ",
  "options.clientsPage": "your clients page",
  "options.pasteAfter": ", or let Hrček make one below.",
  "options.save": "Save",
  "options.test": "Test connection",
  "options.createSummary": "Create a token with your password",
  "options.createHelp": "Your password is used once to ask Hrček for a token, and is never stored. The token appears above and is what the extension uses from then on.",
  "options.identifier": "Email or display name",
  "options.password": "Password",
  "options.create": "Create token",
  "options.saving": "Saving…",
  "options.saved": "Saved.",
  "options.savedNoAccess": "Saved. Site access was declined — press Save again to grant it.",
  "options.asking": "Asking Hrček for a token…",
  "options.tokenCreated": "Saved. Token created as \"{name}\".",
  "options.needServerAndToken": "Save a server address and token first.",
  "options.testing": "Testing…",
  "options.connectedAs": "Connected as {email}.",
  "options.tooManyAttempts": "Too many attempts. Wait a while before trying again, or paste a token from your clients page.",
  "options.cannotMint": "This Hrček cannot make tokens for an extension. Create one on your clients page and paste it above.",

  "popup.notConfigured": "Hrček is not configured yet.",
  "popup.openSettings": "Open settings",
  "popup.alreadySaved": "Already saved",
  "popup.title": "Title",
  "popup.notes": "Notes",
  "popup.picture": "Picture",
  "popup.tags": "Tags",
  "popup.yourFields": "Your fields",
  "popup.save": "Save",
  "popup.update": "Update",
  "popup.saving": "Saving…",
  "popup.savingPicture": "Saving the picture…",
  "popup.saved": "Saved.",
  "popup.updated": "Updated.",
  "popup.savedPictureTrouble": "Saved, but the picture could not be attached: {reason}",
  "popup.settingsUnavailable": "Settings not available.",
  "popup.alreadySavedReview": "This address is already saved. Review the existing entry, then save again.",
  "popup.fieldsUnavailable": "Your fields could not be loaded — saving will not change them.",
  "popup.signInAgain": "Your Hrček no longer accepts this token. Make a new one in settings.",
  "popup.noLongerOffered": "{option} (no longer offered)",

  "picker.noPicture": "No picture",
  "picker.theOneItHas": "The picture it has",
  "picker.unshowable": "It has a picture that cannot be shown here",
  "picker.declaredByPage": "Declared by the page",
  "picker.fromPage": "From the page",
  "picker.kept": "kept",
  "picker.none": "none",
  "picker.earlier": "Earlier pictures",
  "picker.more": "More pictures",
  "picker.showLarger": "Show the picture larger",

  "tags.add": "Add a tag",
  "tags.remove": "Remove {tag}"
}
```

- [ ] **Step 5: Write the Slovenian catalogue**

Create `src/lib/i18n/messages/sl.json`. **Flag for review:** these are a
first pass, and Marko should read them before release. Nothing in the
machinery depends on their wording.

```json
{
  "error.somethingWrong": "Nekaj je šlo narobe.",

  "toolbar.name": "Hrček",
  "toolbar.signInAgain": "Hrček: prijavite se znova",

  "options.heading": "Nastavitve",
  "options.serverUrl": "Naslov strežnika",
  "options.token": "Žeton API",
  "options.language": "Jezik",
  "options.languageAutomatic": "Samodejno ({language})",
  "options.showSaved": "Pokaži, ali je stran že shranjena",
  "options.showSavedHelp": "Orodna vrstica označi hrčka na straneh, ki ste jih shranili. Za to vaš Hrček vpraša za vsak naslov, ki ga obiščete. Če to izklopite, orodna vrstica pove le, ali je razširitev nastavljena.",
  "options.pasteBefore": "Prilepite ga s ",
  "options.clientsPage": "strani vaših odjemalcev",
  "options.pasteAfter": ", ali pa naj ga Hrček ustvari spodaj.",
  "options.save": "Shrani",
  "options.test": "Preveri povezavo",
  "options.createSummary": "Ustvari žeton z geslom",
  "options.createHelp": "Vaše geslo se enkrat uporabi, da Hrčka prosi za žeton, in se nikoli ne shrani. Žeton se pokaže zgoraj in razširitev odslej uporablja samo njega.",
  "options.identifier": "E-pošta ali prikazno ime",
  "options.password": "Geslo",
  "options.create": "Ustvari žeton",
  "options.saving": "Shranjujem…",
  "options.saved": "Shranjeno.",
  "options.savedNoAccess": "Shranjeno. Dostop do strani je bil zavrnjen — znova pritisnite Shrani, da ga dovolite.",
  "options.asking": "Prosim Hrčka za žeton…",
  "options.tokenCreated": "Shranjeno. Žeton je ustvarjen kot »{name}«.",
  "options.needServerAndToken": "Najprej shranite naslov strežnika in žeton.",
  "options.testing": "Preverjam…",
  "options.connectedAs": "Povezani kot {email}.",
  "options.tooManyAttempts": "Preveč poskusov. Počakajte nekaj časa in poskusite znova ali prilepite žeton s strani odjemalcev.",
  "options.cannotMint": "Ta Hrček ne zna ustvariti žetonov za razširitev. Ustvarite ga na strani odjemalcev in ga prilepite zgoraj.",

  "popup.notConfigured": "Hrček še ni nastavljen.",
  "popup.openSettings": "Odpri nastavitve",
  "popup.alreadySaved": "Že shranjeno",
  "popup.title": "Naslov",
  "popup.notes": "Zapiski",
  "popup.picture": "Slika",
  "popup.tags": "Oznake",
  "popup.yourFields": "Vaša polja",
  "popup.save": "Shrani",
  "popup.update": "Posodobi",
  "popup.saving": "Shranjujem…",
  "popup.savingPicture": "Shranjujem sliko…",
  "popup.saved": "Shranjeno.",
  "popup.updated": "Posodobljeno.",
  "popup.savedPictureTrouble": "Shranjeno, slike pa ni bilo mogoče priložiti: {reason}",
  "popup.settingsUnavailable": "Nastavitve niso na voljo.",
  "popup.alreadySavedReview": "Ta naslov je že shranjen. Preglejte obstoječi vnos in shranite znova.",
  "popup.fieldsUnavailable": "Vaših polj ni bilo mogoče naložiti — shranjevanje jih ne bo spremenilo.",
  "popup.signInAgain": "Vaš Hrček tega žetona ne sprejema več. Ustvarite novega v nastavitvah.",
  "popup.noLongerOffered": "{option} (ni več na voljo)",

  "picker.noPicture": "Brez slike",
  "picker.theOneItHas": "Slika, ki jo ima",
  "picker.unshowable": "Ima sliko, ki je tu ni mogoče pokazati",
  "picker.declaredByPage": "Napovedana na strani",
  "picker.fromPage": "S strani",
  "picker.kept": "ohrani",
  "picker.none": "brez",
  "picker.earlier": "Prejšnje slike",
  "picker.more": "Več slik",
  "picker.showLarger": "Pokaži sliko večjo",

  "tags.add": "Dodaj oznako",
  "tags.remove": "Odstrani {tag}"
}
```

- [ ] **Step 6: Write the registry**

Create `src/lib/i18n/catalogues.ts`:

```ts
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
```

- [ ] **Step 7: Write the translator**

Create `src/lib/i18n/index.ts`:

```ts
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
```

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run src/lib/i18n/index.test.ts`
Expected: PASS, every case.

- [ ] **Step 9: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint
git add tsconfig.json src/lib/i18n
git commit -m "feat: a catalogue the extension can speak from"
```

---

## Task 3: Ask the server in the same language

**Files:**

- Modify: `src/lib/api/client.ts`, `src/lib/client-factory.ts`, `tests/fake-hrcek/server.ts`
- Test: `src/lib/api/client.test.ts`, `tests/contract/suite.ts`

**Interfaces:**

- Consumes: nothing from Task 2 at runtime — the locale arrives as a plain string.
- Produces:
  - `new HrcekClient(baseUrl, token, fetchFn?, options?: { acceptLanguage?: string })`
  - `clientFromSettings(settings: Settings, acceptLanguage?: string): HrcekClient`
  - `anonymousClient(serverUrl: string, acceptLanguage?: string): HrcekClient`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/api/client.test.ts`, inside `describe('HrcekClient')`:

```ts
it('asks for the language it was built with', async () => {
  server.use(
    http.get(`${BASE}/api/auth/me`, ({ request }) => {
      // The server translates its messages; codes never change, so this
      // header changes only what a person reads.
      expect(request.headers.get('Accept-Language')).toBe('sl');
      return HttpResponse.json({ email: 'nina@example.com', display_name: null });
    }),
  );

  await new HrcekClient(BASE, 'hrcek_abc', undefined, { acceptLanguage: 'sl' }).me();
});

it('sends no Accept-Language when it was given none', async () => {
  server.use(
    http.get(`${BASE}/api/auth/me`, ({ request }) => {
      expect(request.headers.get('Accept-Language')).toBeNull();
      return HttpResponse.json({ email: 'nina@example.com', display_name: null });
    }),
  );

  await client().me();
});
```

And inside `describe('createToken')`, because a refused mint is exactly
the message somebody needs in their own language:

```ts
it('asks for the language even when anonymous', async () => {
  server.use(
    http.post(`${BASE}/api/auth/tokens/exchange`, ({ request }) => {
      expect(request.headers.get('Accept-Language')).toBe('sl');
      return HttpResponse.json(CREATED, { status: 201 });
    }),
  );

  await new HrcekClient(BASE, null, undefined, { acceptLanguage: 'sl' }).createToken(
    'n',
    'nina@example.com',
    'p',
  );
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/lib/api/client.test.ts`
Expected: FAIL — the header is null where `sl` is expected.

- [ ] **Step 3: Send the header**

`src/lib/api/client.ts` — the constructor gains a fourth parameter, an
options object, so existing `fetchFn` call sites keep working:

```ts
  constructor(
    /** e.g. "https://hrcek.example.com" — no trailing slash. */
    private readonly baseUrl: string,
    /** Bearer token, or null when only anonymous calls are needed. */
    private readonly token: string | null,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
    /**
     * The language to ask the server's messages in. Codes never change,
     * so this changes only what a person reads. Unset sends no header,
     * and the server answers in its own default.
     */
    private readonly options: { acceptLanguage?: string } = {},
  ) {}
```

and in `request()`, beside the other headers:

```ts
const headers: Record<string, string> = {
  Accept: options.accept ?? 'application/json',
  ...(this.options.acceptLanguage !== undefined
    ? { 'Accept-Language': this.options.acceptLanguage }
    : {}),
  ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
  ...(authenticated ? { Authorization: `Bearer ${this.token}` } : {}),
};
```

Note the local parameter is also called `options`; rename the local to
`requestOptions` if the shadowing is confusing, but keep the public
signature as it stands.

- [ ] **Step 4: Pass the locale through the factories**

`src/lib/client-factory.ts`, in full:

```ts
import { HrcekClient } from './api/client';
import type { Settings } from './settings';

/**
 * `acceptLanguage` is the resolved locale, not the stored choice: the
 * choice may be null (Automatic), and the server should be asked in
 * whatever language the person is actually being shown.
 */
export function clientFromSettings(
  settings: Settings,
  acceptLanguage?: string,
): HrcekClient {
  return new HrcekClient(settings.serverUrl, settings.token, undefined, {
    ...(acceptLanguage === undefined ? {} : { acceptLanguage }),
  });
}

/** For calls that carry their own credentials, such as minting a token. */
export function anonymousClient(serverUrl: string, acceptLanguage?: string): HrcekClient {
  return new HrcekClient(serverUrl, null, undefined, {
    ...(acceptLanguage === undefined ? {} : { acceptLanguage }),
  });
}
```

- [ ] **Step 5: Teach the fake to translate one message**

`tests/fake-hrcek/server.ts` — mirror the real server's behaviour, so
the header's effect is provable rather than merely asserted on the way
out. Add beside `errorBody`:

```ts
/**
 * The real server translates messages and falls back to English for a
 * language it does not carry (../hrcek/docs/dev/api.md, "Languages").
 * One message is enough to prove a client asked in the right language.
 */
const TRANSLATIONS: Record<string, Record<string, string>> = {
  sl: { 'HRC-CORE-0003': 'Zahtevani vir ne obstaja.' },
};

function languageOf(req: http.IncomingMessage): string {
  // Good enough for a fake: the first tag, without its quality weight.
  const header = req.headers['accept-language'] ?? '';
  return header.split(',')[0]?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function translate(req: http.IncomingMessage, body: ErrorBody): ErrorBody {
  const message = TRANSLATIONS[languageOf(req)]?.[body.error.code];
  if (message === undefined) return body;
  return { error: { ...body.error, message } };
}
```

Then wrap the 404 in the `GET /api/entries/by-url/` route — the one a
client meets constantly:

```ts
if (route === 'GET /api/entries/by-url/') {
  const url = requestUrl.searchParams.get('url') ?? '';
  const entry = entries.get(normalizeUrl(url));
  if (entry === undefined) {
    return json(
      res,
      404,
      translate(
        req,
        errorBody('HRC-CORE-0003', 'The requested resource does not exist.', {
          url,
        }),
      ),
    );
  }
  return json(res, 200, entry);
}
```

- [ ] **Step 6: Pin it in the contract suite**

`tests/contract/suite.ts` — read the file first and follow its existing
shape (it runs against both the fake and a real Hrček). Add a case that
holds for both:

```ts
it('answers in the language the client asked for, and in English otherwise', async () => {
  const missing = 'https://example.com/nothing-is-here';

  const slovenian = await new HrcekClient(baseUrl, token, undefined, {
    acceptLanguage: 'sl',
  })
    .getEntryByUrl(missing)
    .then(
      () => null,
      (error: unknown) => error as HrcekApiError,
    );
  const english = await new HrcekClient(baseUrl, token).getEntryByUrl(missing).then(
    () => null,
    (error: unknown) => error as HrcekApiError,
  );

  // The code is the contract and never changes with the language.
  expect(slovenian?.code).toBe('HRC-CORE-0003');
  expect(english?.code).toBe('HRC-CORE-0003');
  expect(slovenian?.message).not.toBe(english?.message);
});
```

Match the suite's own names for `baseUrl`/`token` — read it before
writing.

- [ ] **Step 7: Run every test**

Run: `pnpm test`
Expected: PASS, including the contract suite against the fake.

- [ ] **Step 8: Commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/api/client.ts src/lib/api/client.test.ts src/lib/client-factory.ts tests/fake-hrcek/server.ts tests/contract/suite.ts
git commit -m "feat: ask Hrček for its messages in the reader's language"
```

---

## Task 4: A language in settings

**Files:**

- Modify: `src/lib/settings.ts`
- Test: `src/lib/settings.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `Settings.language: string | null` — null means Automatic.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/settings.test.ts`, inside `describe('settings')`:

```ts
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
```

The two existing cases that assert a whole settings object
(`round-trips settings through storage.local`, `drops the authMode left
by older versions`) gain `language: null` in their expectations, and
every `saveSettings` call in the file gains `language: null`.

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm vitest run src/lib/settings.test.ts`
Expected: FAIL — `language` is not a property of `Settings`.

- [ ] **Step 3: Add the field**

`src/lib/settings.ts`:

```ts
export interface Settings {
  /** Base address of the Hrček server, no trailing slash. */
  serverUrl: string;
  /**
   * Bearer token — the only credential this client keeps. A password is
   * used once to mint a token and never stored.
   */
  token: string | null;
  /**
   * Whether the toolbar says that a page is already saved. Doing so means
   * asking the server about every address visited, so it is a choice, not
   * a given. On by default: it is the useful behaviour, and the cost is
   * stated where it is switched.
   */
  showSavedState: boolean;
  /**
   * The language to speak, or null for Automatic — the browser's own.
   * The chosen tag is stored rather than the resolved one, so a browser
   * that changes language later is still followed.
   */
  language: string | null;
}

// storage.local only: storage.sync is unencrypted and replicated.
const settingsItem = storage.defineItem<
  | (Omit<Settings, 'showSavedState' | 'language'> & {
      authMode?: string;
      showSavedState?: boolean;
      language?: string | null;
    })
  | null
>('local:settings', { fallback: null });
```

In `loadSettings`:

```ts
return {
  serverUrl: stored.serverUrl,
  token: stored.token,
  // Absent in settings written before the switch existed.
  showSavedState: stored.showSavedState ?? true,
  // Absent in settings written before the choice existed: Automatic.
  language: stored.language ?? null,
};
```

In `saveSettings`:

```ts
await settingsItem.setValue({
  serverUrl: normalizeServerUrl(settings.serverUrl),
  token: settings.token,
  showSavedState: settings.showSavedState,
  language: settings.language,
});
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS. `pnpm typecheck` will now flag the options page's
`saveSettings` calls — add `language: null` there as a stopgap in this
commit; Task 5 replaces it with the real choice.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/settings.ts src/lib/settings.test.ts src/entrypoints/options/main.ts
git commit -m "feat: remember which language somebody chose"
```

---

## Task 5: The options page, in the language you pick

**Files:**

- Modify: `src/entrypoints/options/main.ts`
- Test: `tests/e2e/save-flow.spec.ts`

**Interfaces:**

- Consumes: `createTranslator`, `localeFor`, `availableLocales`, `LOCALE_NAMES`, `Settings.language`, `clientFromSettings`/`anonymousClient` with a locale.
- Produces: `#language` — a `<select>` whose empty value means Automatic.

- [ ] **Step 1: Write the failing e2e test**

Add to `tests/e2e/save-flow.spec.ts`:

```ts
test('speaks the language the settings page chose', async ({ context, extensionId }) => {
  const page = await openOptions(context, extensionId);

  // Automatic names the language it resolved to, so "automatic" is
  // never a mystery.
  await expect(page.locator('#language option[value=""]')).toContainText('Automatic');
  await expect(page.locator('h1')).toHaveText('Settings');

  await page.selectOption('#language', 'sl');
  // Re-rendered immediately, not on the next open — this is a page
  // somebody may never return to.
  await expect(page.locator('h1')).toHaveText('Nastavitve');
  await expect(page.locator('#save')).toHaveText('Shrani');
});

test('keeps the chosen language once there are settings to keep it in', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const page = await openOptions(context, extensionId);

  await page.selectOption('#language', 'sl');
  await expect(page.locator('h1')).toHaveText('Nastavitve');

  await page.reload();
  await expect(page.locator('h1')).toHaveText('Nastavitve');
  await expect(page.locator('#language')).toHaveValue('sl');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:e2e -- -g "language"`
Expected: FAIL — there is no `#language`.

- [ ] **Step 3: Rewrite the options page around a translator**

`src/entrypoints/options/main.ts`. The page becomes a `render()`
function, called on load and again whenever the language changes; the
module-level `const serverUrlInput = …` lookups become assignments made
after each render, because the markup is rebuilt.

```ts
import { browser } from 'wxt/browser';
import { HrcekApiError, HrcekNetworkError } from '../../lib/api/errors';
import { anonymousClient, clientFromSettings } from '../../lib/client-factory';
import {
  availableLocales,
  createTranslator,
  localeFor,
  type Translator,
} from '../../lib/i18n';
import { LOCALE_NAMES } from '../../lib/i18n/catalogues';
import { loadSettings, normalizeServerUrl, saveSettings } from '../../lib/settings';
import { tokenName } from '../../lib/token-name';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** The stored choice: null is Automatic. */
let chosenLanguage: string | null = null;
let t: Translator = createTranslator(localeFor(null));

let serverUrlInput: HTMLInputElement;
let tokenInput: HTMLInputElement;
let identifierInput: HTMLInputElement;
let passwordInput: HTMLInputElement;
let accountLink: HTMLAnchorElement;
let showSavedInput: HTMLInputElement;

function escapeText(value: string): string {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

function languageOptions(): string {
  // Automatic first, naming what it resolved to. Then every language in
  // its own words — the only naming that helps somebody who has landed
  // in a language they cannot read.
  const resolved = localeFor(null);
  const automatic = t('options.languageAutomatic', {
    language: LOCALE_NAMES[resolved] ?? resolved,
  });
  const rows = [`<option value="">${escapeText(automatic)}</option>`];
  for (const locale of availableLocales()) {
    const selected = locale === chosenLanguage ? ' selected' : '';
    rows.push(
      `<option value="${locale}"${selected}>${escapeText(LOCALE_NAMES[locale] ?? locale)}</option>`,
    );
  }
  return rows.join('');
}
```

The markup keeps every existing id — `#server-url`, `#token`,
`#show-saved`, `#account-link`, `#save`, `#test`, `#status`,
`#create-token`, `#identifier`, `#password`, `#create` — and gains the
selector:

```ts
function render(): void {
  app.innerHTML = `
    <div class="hrcek-header">
      <img src="/icon/32.png" alt="" />
      <span class="name">Hrček</span>
    </div>
    <h1>${escapeText(t('options.heading'))}</h1>
    <form id="settings-form">
      <div class="field">
        <label for="server-url">${escapeText(t('options.serverUrl'))}</label>
        <input id="server-url" type="url" placeholder="https://hrcek.example.com" required />
      </div>
      <div class="field">
        <label for="token">${escapeText(t('options.token'))}</label>
        <input id="token" type="password" placeholder="hrcek_…" autocomplete="off" />
      </div>
      <div class="field">
        <label for="language">${escapeText(t('options.language'))}</label>
        <select id="language">${languageOptions()}</select>
      </div>
      <div class="field">
        <label for="show-saved"><input type="checkbox" id="show-saved" /> ${escapeText(t('options.showSaved'))}</label>
        <p>${escapeText(t('options.showSavedHelp'))}</p>
      </div>
      <p>${escapeText(t('options.pasteBefore'))}<a id="account-link" href="#" target="_blank">${escapeText(t('options.clientsPage'))}</a>${escapeText(t('options.pasteAfter'))}</p>
      <button type="submit" id="save">${escapeText(t('options.save'))}</button>
      <button type="button" class="quiet" id="test">${escapeText(t('options.test'))}</button>
      <p id="status" data-kind="info"></p>
    </form>

    <details id="create-token" open>
      <summary>${escapeText(t('options.createSummary'))}</summary>
      <p>${escapeText(t('options.createHelp'))}</p>
      <div class="field">
        <label for="identifier">${escapeText(t('options.identifier'))}</label>
        <input id="identifier" autocomplete="username" />
      </div>
      <div class="field">
        <label for="password">${escapeText(t('options.password'))}</label>
        <input id="password" type="password" autocomplete="current-password" />
      </div>
      <button type="button" id="create">${escapeText(t('options.create'))}</button>
    </details>
  `;
  wire();
}
```

`wire()` holds every `querySelector` and `addEventListener` the file has
today — the submit handler, `#create`, `#test`, the `#server-url`
change that rewrites `accountLink.href` — because listeners die with the
markup they were attached to. A first visit has no stored settings, so
`showSavedInput.checked = true` belongs there too. The new listener is
the selector's:

```ts
document
  .querySelector<HTMLSelectElement>('#language')!
  .addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    chosenLanguage = value === '' ? null : value;
    t = createTranslator(localeFor(chosenLanguage));
    // Keep what is typed but not yet saved: rebuilding the markup
    // would otherwise throw away a half-entered token.
    const kept = {
      serverUrl: serverUrlInput.value,
      token: tokenInput.value,
      identifier: identifierInput.value,
      showSaved: showSavedInput.checked,
    };
    render();
    serverUrlInput.value = kept.serverUrl;
    tokenInput.value = kept.token;
    identifierInput.value = kept.identifier;
    showSavedInput.checked = kept.showSaved;
    void persistLanguage();
  });
```

```ts
/**
 * The language is a preference, not a credential: it is stored the
 * moment it is chosen rather than waiting for Save. There is nothing to
 * store it in on a first visit — the Save that creates the settings
 * carries it.
 */
async function persistLanguage(): Promise<void> {
  const settings = await loadSettings();
  if (settings === null) return;
  await saveSettings({ ...settings, language: chosenLanguage });
}
```

Every `saveSettings` call now carries `language: chosenLanguage`, and
every client is built with the resolved locale:

```ts
const user = await clientFromSettings(settings, localeFor(chosenLanguage)).me();
```

```ts
const created = await anonymousClient(serverUrl, localeFor(chosenLanguage)).createToken(
  name,
  identifierInput.value.trim(),
  passwordInput.value,
);
```

Every status string becomes a lookup — `options.saving`, `options.saved`,
`options.savedNoAccess`, `options.asking`, `options.tokenCreated` (with
`{name}`), `options.needServerAndToken`, `options.testing`,
`options.connectedAs` (with `{email}`) — and `messageFor` too:

```ts
function messageFor(error: unknown): string {
  if (error instanceof HrcekApiError) {
    // Rate-limited, ten an hour by default. The throttle's reply is not
    // the Hrček error envelope, so the status is all there is to go on.
    if (error.status === 429) return t('options.tooManyAttempts');
    // An older Hrček has no exchange route; its 404 says nothing useful.
    if (error.status === 404) return t('options.cannotMint');
    return error.message;
  }
  if (error instanceof HrcekNetworkError) return error.message;
  return t('error.somethingWrong');
}
```

`restore()` seeds the language before the first render:

```ts
async function restore(): Promise<void> {
  const settings = await loadSettings();
  if (settings !== null) {
    chosenLanguage = settings.language;
    t = createTranslator(localeFor(chosenLanguage));
  }
  render();
  if (settings === null) return;
  serverUrlInput.value = settings.serverUrl;
  accountLink.href = `${settings.serverUrl}/accounts/me/clients/`;
  tokenInput.value = settings.token ?? '';
  showSavedInput.checked = settings.showSavedState;
  // Minting is the first-run path; once a token is held, fold it away.
  if (settings.token !== null) {
    document.querySelector<HTMLDetailsElement>('#create-token')!.open = false;
  }
}

void restore();
```

- [ ] **Step 4: Run the new e2e tests**

Run: `pnpm test:e2e -- -g "language"`
Expected: PASS.

- [ ] **Step 5: Run the whole e2e suite**

Run: `pnpm test:e2e`
Expected: PASS — the other options-page tests still find every id.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/entrypoints/options/main.ts tests/e2e/save-flow.spec.ts
git commit -m "feat: choose the language the extension speaks"
```

---

## Task 6: The popup, in that same language

**Files:**

- Modify: `src/entrypoints/popup/main.ts`, `src/entrypoints/popup/picker.ts`, `src/entrypoints/popup/chips.ts`
- Test: `src/entrypoints/popup/picker.test.ts`, `src/entrypoints/popup/chips.test.ts`

**Interfaces:**

- Consumes: `Translator`, `createTranslator`, `localeFor`, `clientFromSettings(settings, locale)`.
- Produces: `createPicker(host, { candidates, held, existing, t })`, `createChipInput(host, { tags, suggest, onSubmit, t })`.

- [ ] **Step 1: Write the failing tests**

In `src/entrypoints/popup/picker.test.ts` — read its existing mount
helper first and give it a translator with an English default, so every
other case in the file is untouched:

```ts
import { createTranslator } from '../../lib/i18n';

// A real translator over the real catalogue: a test double would pass
// while the catalogue was missing the key.
it('labels its tiles in the language it was handed', () => {
  const host = document.createElement('div');
  createPicker(host, {
    candidates: [
      { url: 'https://example.com/a.jpg', width: 100, height: 80, fromHead: false },
    ],
    held: null,
    existing: false,
    t: createTranslator('sl'),
  });

  expect(host.querySelector('.tile.none')!.getAttribute('aria-label')).toBe('Brez slike');
});

it('says a held picture cannot be shown, rather than looking empty', () => {
  const host = document.createElement('div');
  createPicker(host, {
    candidates: [],
    held: { src: null },
    existing: true,
    t: createTranslator('en'),
  });

  expect(host.querySelector('.tile.held')!.getAttribute('aria-label')).toBe(
    'It has a picture that cannot be shown here',
  );
});
```

In `src/entrypoints/popup/chips.test.ts`:

```ts
import { createTranslator } from '../../lib/i18n';

it('asks for a tag in the language it was handed', () => {
  const { input } = mount([], async () => [], createTranslator('sl'));
  expect(input.placeholder).toBe('Dodaj oznako');
});
```

with `mount`'s new third parameter defaulting to `createTranslator('en')`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/entrypoints/popup`
Expected: FAIL — `t` is not a property of the options object.

- [ ] **Step 3: Thread the translator through the two widgets**

`picker.ts` — `PickerOptions` gains `t: Translator`, and each literal
becomes a lookup:

```ts
const list: Tile[] = [
  { key: 'none', src: null, className: 'tile none', label: t('picker.noPicture') },
];
if (held !== null) {
  list.push({
    key: HELD,
    src: held.src,
    className: held.src === null ? 'tile held unshowable' : 'tile held',
    // A picture it has but cannot show says so, rather than looking
    // like an empty tile somebody might click away.
    label: held.src === null ? t('picker.unshowable') : t('picker.theOneItHas'),
  });
}
for (const candidate of candidates) {
  list.push({
    key: candidate.url,
    src: candidate.url,
    className: 'tile',
    label: candidate.fromHead ? t('picker.declaredByPage') : t('picker.fromPage'),
  });
}
```

with `t('picker.earlier')`, `t('picker.more')` and `t('picker.showLarger')`
on the three buttons, `t('picker.kept')` / `t('picker.none')` on the
textual tiles, and the hero's empty state using `t('picker.theOneItHas')`
/ `t('picker.noPicture')`.

`chips.ts` — options gain `t: Translator`; the input's placeholder
becomes `t('tags.add')` and the remove button's label
`t('tags.remove', { tag })`.

- [ ] **Step 4: Translate the popup**

`src/entrypoints/popup/main.ts` — a module-level translator, set before
anything renders:

```ts
import { createTranslator, localeFor, type Translator } from '../../lib/i18n';

let t: Translator = createTranslator(localeFor(null));
```

`main()` sets it from settings and builds the client with the same
locale:

```ts
async function main(): Promise<void> {
  settings = await loadSettings();
  // A fresh install has no settings and still has to say so: Automatic
  // resolves against the browser.
  const locale = localeFor(settings?.language ?? null);
  t = createTranslator(locale);
  if (settings === null) {
    renderUnconfigured();
    return;
  }
  client = clientFromSettings(settings, locale);
  …
}
```

Every literal in `renderUnconfigured`, `renderForm`, `fieldsMarkup`,
`fieldControl` and `save()` becomes a `t()` call against the keys Task 2
wrote: `popup.notConfigured`, `popup.openSettings`, `popup.alreadySaved`,
`popup.title`, `popup.notes`, `popup.picture`, `popup.tags`,
`popup.yourFields`, `popup.save`, `popup.update`, `popup.saving`,
`popup.saved`, `popup.updated`, `popup.settingsUnavailable`,
`popup.alreadySavedReview`, `popup.savedPictureTrouble` (with
`{reason}`), `popup.noLongerOffered` (with `{option}`), and
`error.somethingWrong` in `messageFor`. Both widgets are constructed
with `t`:

```ts
  picker = createPicker(pictureHost, { candidates, held, existing, t });
  chips = createChipInput(document.querySelector<HTMLDivElement>('#tags')!, {
    tags: parseTags(form.tags),
    suggest: (prefix) => …,
    onSubmit: () => void save(),
    t,
  });
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Prove nothing was left behind**

```bash
grep -rn "'[A-Z][a-z][^']\{3,\}'" src/entrypoints/popup/*.ts | grep -v "t(" | grep -v "//"
```

Expected: no user-visible English remains — matches should only be
selectors, event names, class names and comments. Anything that reads
like a sentence is a miss; fix it.

- [ ] **Step 7: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/entrypoints/popup
git commit -m "feat: say the popup's own words in the chosen language"
```

---

## Task 7: A toast the page can show

**Files:**

- Create: `src/entrypoints/toast.ts`, `src/lib/page/toast-client.ts`
- Test: `tests/entrypoints/toast.test.ts`

**Interfaces:**

- Consumes: `injectFile(tabId, file)` from `src/lib/platform/inject.ts`.
- Produces: `showToast(tabId: number, text: string, kind: 'success' | 'error'): Promise<void>` — resolves always, never throws.

- [ ] **Step 1: Write the failing test**

Create `tests/entrypoints/toast.test.ts`:

```ts
// @vitest-environment jsdom
// Not colocated: every file directly under src/entrypoints/ is an
// entrypoint to WXT, so a toast.test.ts beside toast.ts would be built
// and shipped inside the zip.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import toast from '../../src/entrypoints/toast';

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => unknown;

function inject(): Listener[] {
  const listeners: Listener[] = [];
  vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener').mockImplementation(
    (listener: unknown) => {
      listeners.push(listener as Listener);
    },
  );
  toast.main!();
  return listeners;
}

function shadow(): ShadowRoot | null {
  return document.getElementById('__hrcek-toast')?.shadowRoot ?? null;
}

describe('the toast script', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>)['__hrcekToastReady'];
    document.getElementById('__hrcek-toast')?.remove();
    document.body.innerHTML = '';
  });

  it('shows the text it was sent, inside a shadow root no page CSS can reach', () => {
    const [listener] = inject();
    const sendResponse = vi.fn();

    const answer = listener!(
      { type: 'hrcek:toast', text: 'Saved.', kind: 'success' },
      {},
      sendResponse,
    );

    // sendResponse + `return true`: Chrome discards a returned Promise.
    expect(answer).toBe(true);
    expect(sendResponse).toHaveBeenCalledTimes(1);
    expect(shadow()!.textContent).toContain('Saved.');
  });

  it('shows the server’s words as text, never as markup', () => {
    // The message is translated server-side and passes through the
    // popup; it is content, not HTML.
    const [listener] = inject();
    listener!(
      { type: 'hrcek:toast', text: '<img src=x onerror=alert(1)>', kind: 'error' },
      {},
      vi.fn(),
    );

    expect(shadow()!.querySelector('img')).toBeNull();
    expect(shadow()!.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('replaces the toast already showing rather than stacking a second', () => {
    const [listener] = inject();
    listener!({ type: 'hrcek:toast', text: 'Saved.', kind: 'success' }, {}, vi.fn());
    listener!({ type: 'hrcek:toast', text: 'Updated.', kind: 'success' }, {}, vi.fn());

    expect(document.querySelectorAll('#__hrcek-toast')).toHaveLength(1);
    expect(shadow()!.textContent).toContain('Updated.');
    expect(shadow()!.textContent).not.toContain('Saved.');
  });

  it('takes itself away, and gives an error longer to be read', () => {
    vi.useFakeTimers();
    const [listener] = inject();

    listener!({ type: 'hrcek:toast', text: 'Saved.', kind: 'success' }, {}, vi.fn());
    vi.advanceTimersByTime(3100);
    expect(document.getElementById('__hrcek-toast')).toBeNull();

    listener!({ type: 'hrcek:toast', text: 'Trouble.', kind: 'error' }, {}, vi.fn());
    vi.advanceTimersByTime(3100);
    expect(document.getElementById('__hrcek-toast')).not.toBeNull();
    vi.advanceTimersByTime(3000);
    expect(document.getElementById('__hrcek-toast')).toBeNull();
  });

  it('leaves a message of another type alone, answering undefined synchronously', () => {
    const [listener] = inject();
    const sendResponse = vi.fn();

    expect(listener!({ type: 'something:else' }, {}, sendResponse)).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('adds one listener however often it is injected', () => {
    const listeners = inject();
    toast.main!();

    expect(listeners).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/entrypoints/toast.test.ts`
Expected: FAIL — `Cannot find module '../../src/entrypoints/toast'`.

- [ ] **Step 3: Write the toast**

Create `src/entrypoints/toast.ts`:

```ts
/**
 * Says on the page what the popup would have said, because the popup is
 * about to close itself. Injected on demand when a save finishes — not
 * registered, because the extension has no business running on every
 * page you load.
 *
 * It answers a message rather than a return value, and with
 * `sendResponse` + `return true` rather than a Promise: Chrome discards
 * a Promise returned from `onMessage`. Same contract as `harvest.ts`.
 */
const HOST_ID = '__hrcek-toast';

/** Long enough to read; an error is longer, because there is more of it. */
const LINGER_MS = { success: 3000, error: 6000 };

/** The website's tokens, inlined: a shadow root inherits no stylesheet. */
const STYLE = `
  :host { all: initial; }
  .toast {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    max-width: 22rem;
    box-sizing: border-box;
    padding: 0.6rem 0.8rem;
    border-radius: 0.4375rem;
    border: 1px solid #e4dfd5;
    background: #ffffff;
    color: #292521;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    box-shadow: 0 6px 24px rgb(0 0 0 / 18%);
    opacity: 0;
    transition: opacity 150ms ease-out;
  }
  .toast.in { opacity: 1; }
  .toast.error { border-color: #b3261c; color: #b3261c; }
  @media (prefers-color-scheme: dark) {
    .toast { background: #211e1a; color: #e9e4dc; border-color: #3b352c; }
    .toast.error { border-color: #ef8983; color: #ef8983; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast { transition: none; opacity: 1; }
  }
`;

interface ToastMessage {
  type?: string;
  text?: string;
  kind?: 'success' | 'error';
}

export default defineUnlistedScript(() => {
  const flag = '__hrcekToastReady';
  const scope = window as unknown as Record<string, unknown>;
  // Injected on every save; a second listener would draw every toast twice.
  if (scope[flag] === true) return;
  scope[flag] = true;

  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(text: string, kind: 'success' | 'error'): void {
    clearTimeout(timer);
    // On documentElement, not body: a page that restyles or replaces its
    // body cannot take the toast with it.
    let host = document.getElementById(HOST_ID);
    if (host === null) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.attachShadow({ mode: 'open' });
      document.documentElement.append(host);
    }
    const root = host.shadowRoot!;
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = STYLE;
    const box = document.createElement('div');
    box.className = kind === 'error' ? 'toast error' : 'toast';
    box.setAttribute('role', 'status');
    // textContent, never innerHTML: this is a message, not markup.
    box.textContent = text;
    root.append(style, box);
    // Next frame, so the transition has a state to start from.
    requestAnimationFrame(() => box.classList.add('in'));

    timer = setTimeout(() => {
      document.getElementById(HOST_ID)?.remove();
    }, LINGER_MS[kind]);
  }

  browser.runtime.onMessage.addListener(
    (message: unknown, _sender: unknown, sendResponse: (response: unknown) => void) => {
      const incoming = message as ToastMessage;
      // Not ours: answer undefined synchronously, leaving the message to
      // whatever else is listening.
      if (incoming.type !== 'hrcek:toast') return undefined;
      show(incoming.text ?? '', incoming.kind === 'error' ? 'error' : 'success');
      sendResponse({ shown: true });
      return true;
    },
  );
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run tests/entrypoints/toast.test.ts`
Expected: PASS. If jsdom does not run `requestAnimationFrame` callbacks,
keep the frame wait — it is what makes the fade visible — and assert on
text rather than on the `in` class.

- [ ] **Step 5: Write the client half**

Create `src/lib/page/toast-client.ts`:

```ts
import { browser } from 'wxt/browser';
import { injectFile } from '../platform/inject';

/**
 * Says something on the page. Any failure is silence: a PDF viewer, a
 * `chrome://` page, the Web Store, a tab that closed — none of them can
 * host a toast, and none of them is a save that went wrong. The toolbar
 * icon is the confirmation in that case.
 *
 * Resolves always. The caller closes itself immediately afterwards and
 * has nothing it could do with a rejection.
 */
export async function showToast(
  tabId: number,
  text: string,
  kind: 'success' | 'error',
): Promise<void> {
  try {
    await injectFile(tabId, 'toast.js');
    await browser.tabs.sendMessage(tabId, { type: 'hrcek:toast', text, kind });
  } catch {
    // Nowhere to say it. The entry is saved either way.
  }
}
```

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/entrypoints/toast.ts src/lib/page/toast-client.ts tests/entrypoints/toast.test.ts
git commit -m "feat: say it on the page, where the popup was"
```

---

## Task 8: The popup closes itself

**Files:**

- Modify: `src/entrypoints/popup/main.ts`
- Test: `tests/e2e/save-flow.spec.ts`

**Interfaces:**

- Consumes: `showToast(tabId, text, kind)` from Task 7.
- Produces: nothing other tasks import. In `--mode e2e` builds only, a finished popup sets `data-hrcek-closed="true"` on `<html>`.

- [ ] **Step 1: Write the failing e2e tests**

The fake Hrček serves HTML at `GET /`, which gives a real page to toast
on. Add to `tests/e2e/save-flow.spec.ts`:

```ts
test('closes itself after saving and says so on the page', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);

  // A real page, in its own tab, for the toast to land on.
  const page = await context.newPage();
  await page.goto(`${SERVER}/`);

  const popup = await openPopup(context, extensionId, `${SERVER}/`, 'Fake Hrček');
  await popup.click('#save');

  // The popup asked to close. Playwright opened it as an ordinary tab,
  // which window.close() cannot touch, so the e2e build marks the
  // document instead of vanishing.
  await expect(popup.locator('html')).toHaveAttribute('data-hrcek-closed', 'true');

  // And the confirmation is on the page, inside a shadow root.
  const toast = page.locator('#__hrcek-toast');
  await expect(toast).toBeAttached();
  await expect
    .poll(() => toast.evaluate((host: HTMLElement) => host.shadowRoot?.textContent ?? ''))
    .toContain('Saved.');
});

test('stays open when the entry itself could not be saved', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const popup = await context.newPage();
  // The save was refused: this is the case where somebody must act, so
  // the popup must not disappear with the reason.
  await popup.route('**/api/entries/', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'HRC-CORE-0002',
          message: 'The submitted data is not valid.',
          details: {},
        },
      }),
    }),
  );
  const query = new URLSearchParams({ url: 'https://example.com/refused', title: 'R' });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?${query}`);

  await popup.click('#save');
  await expect(popup.locator('#status')).toHaveAttribute('data-kind', 'error');
  await expect(popup.locator('html')).not.toHaveAttribute('data-hrcek-closed', 'true');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:e2e -- -g "closes itself"`
Expected: FAIL — no `data-hrcek-closed`, no toast.

- [ ] **Step 3: Find the tab to toast on**

`src/entrypoints/popup/main.ts`, beside `getPageInfo`:

```ts
/**
 * The tab the save was about. In production that is the active tab, the
 * one this popup hangs off. Under Playwright the popup IS the active
 * tab, so the e2e build looks the page up by the address it was handed
 * — the same seam as `?url=` above, and the same build-time constant,
 * so neither branch is in a production bundle.
 */
async function targetTabId(): Promise<number | undefined> {
  if (import.meta.env.MODE === 'e2e') {
    const [seeded] = await browser.tabs.query({ url: pageUrl });
    return seeded?.id;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}
```

- [ ] **Step 4: Finish, then close**

Still in `main.ts` — one exit for a save that stood:

```ts
/**
 * The save is done. Say so on the page — which outlives this popup —
 * and then go away. The status line is set first regardless: it is what
 * a page that cannot host a toast leaves behind, and what the e2e build
 * reads.
 */
async function finish(kind: 'success' | 'error', text: string): Promise<void> {
  setStatus(kind, text);
  const tabId = await targetTabId();
  if (tabId !== undefined) await showToast(tabId, text, kind);
  closeSelf();
}

function closeSelf(): void {
  if (import.meta.env.MODE === 'e2e') {
    // Playwright opens the popup as an ordinary tab, and window.close()
    // may not close a tab a script did not open. Mark the document so
    // the test can see that the popup asked.
    document.documentElement.dataset['hrcekClosed'] = 'true';
    return;
  }
  window.close();
}
```

and `save()`'s tail becomes:

```ts
    const outcome = await submitSave(client, {
      ...request,
      ...(choice.kind === 'url' && bytes === null ? { imageUrl: choice.url } : {}),
    });
    // The entry exists on the server now, regardless of what the picture
    // does below — the tick reports the entry, not the picture. Caught,
    // not merely voided: on Chrome a message with no live listener
    // rejects, and an unhandled rejection is noise at best.
    void browser.runtime
      .sendMessage({ type: 'hrcek:saved', url: outcome.entry.url, held: true })
      .catch(() => undefined);

    // The picture's bytes live only in this popup — Chrome serialises
    // messages as JSON, so they cannot be handed to the background to
    // finish with. The popup waits the second or two instead.
    if (choice.kind !== 'unchanged') setStatus('info', t('popup.savingPicture'));
    const trouble =
      outcome.pictureTrouble ??
      (await attachPicture(client, outcome.entry, choice, bytes));
    if (trouble !== null) {
      // The entry stands; only the picture did not. Still a close: the
      // entry saved, which is what was asked for.
      await finish('error', t('popup.savedPictureTrouble', { reason: trouble }));
      return;
    }
    await finish(
      'success',
      outcome.status === 'created' ? t('popup.saved') : t('popup.updated'),
    );
  } catch (error) {
    // The entry did not save. Stay open: this is the case where somebody
    // must do something about it.
    setStatus('error', messageFor(error));
  }
```

- [ ] **Step 5: Run the whole e2e suite**

Run: `pnpm test:e2e`
Expected: PASS, all of it. The older tests assert `#status` after a
save; the status is still set before the close, and in the e2e build the
close does not remove the page.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/entrypoints/popup/main.ts tests/e2e/save-flow.spec.ts
git commit -m "feat: close the popup on a save and confirm on the page"
```

---

## Task 9: Say what could not be read

**Files:**

- Modify: `src/entrypoints/popup/main.ts`, `src/entrypoints/popup/style.css`, `src/entrypoints/popup/chips.ts`, `src/lib/page/harvest-client.ts`
- Test: `tests/e2e/save-flow.spec.ts`

**Interfaces:**

- Consumes: `t`, the `popup.fieldsUnavailable` key.
- Produces: `#fields-trouble` — the banner, present only when `GET /api/fields/` failed.

- [ ] **Step 1: Write the failing e2e test**

```ts
test('says when your fields could not be read, instead of hiding them', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const popup = await context.newPage();
  await popup.route('**/api/fields/**', (route) => route.abort('failed'));
  const query = new URLSearchParams({ url: 'https://example.com/fieldless', title: 'F' });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?${query}`);

  // Silence here reads as "this account has no fields", which is a
  // different and wrong thing.
  await expect(popup.locator('#fields-trouble')).toContainText(
    'fields could not be loaded',
  );
  // Saving is still allowed: omitted fields are patched, not cleared.
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Saved.');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e -- -g "could not be read"`
Expected: FAIL — there is no `#fields-trouble`.

- [ ] **Step 3: Remember that the read failed, and say so**

`src/entrypoints/popup/main.ts`:

```ts
/** Loaded once in main(); null when GET /api/fields/ could not be read. */
let definitions: FieldOut[] | null = null;
/** True when that read failed, as opposed to answering no fields at all. */
let fieldsFailed = false;
```

```ts
// Not fatal: without them the form falls back to the entry's own keys,
// which is enough to show and re-send what the entry already holds.
// Worth saying, though — an account with fields that silently shows
// none looks exactly like an account without any.
definitions = await client.listFields().then(
  (fields) => fields,
  (error: unknown) => {
    console.warn('[hrcek] could not read the account’s fields', error);
    fieldsFailed = true;
    return null;
  },
);
```

and in `renderForm`, immediately above the fields block:

```ts
      ${fieldsFailed ? `<p id="fields-trouble" class="trouble">${escapeText(t('popup.fieldsUnavailable'))}</p>` : ''}
      ${fieldsMarkup(form.fields)}
```

`src/entrypoints/popup/style.css` gains:

```css
/* A note about something that did not load. Not the status line: the
   save itself is unaffected, and this outlives any status. */
.trouble {
  margin: 0 0 0.55rem;
  font-size: 0.72rem;
  color: var(--danger);
}
```

- [ ] **Step 4: Warn where silence is still right**

`src/entrypoints/popup/chips.ts`, in the suggestion failure handler:

```ts
        (error: unknown) => {
          // Suggestions are a convenience. Typing still works without
          // them, so this is for the console, not for the person.
          console.warn('[hrcek] could not read label suggestions', error);
          if (mine === generation) clearSuggestions();
        },
```

`src/lib/page/harvest-client.ts`:

```ts
  } catch (error) {
    // A page that cannot be read offers no picture, which is not a
    // failure worth showing — a PDF would say it every single time.
    console.warn('[hrcek] could not read the page’s pictures', error);
    return [];
  }
```

- [ ] **Step 5: Run everything**

Run: `pnpm test && pnpm test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint
git add src/entrypoints/popup src/lib/page/harvest-client.ts tests/e2e/save-flow.spec.ts
git commit -m "feat: say when your fields could not be read"
```

---

## Task 10: A token the server no longer accepts

**Files:**

- Modify: `src/lib/api/errors.ts`, `src/lib/saved-state.ts`, `src/lib/platform/action.ts`, `src/lib/icon.ts`, `src/entrypoints/background.ts`, `src/entrypoints/popup/main.ts`
- Test: `src/lib/api/errors.test.ts`, `src/lib/saved-state.test.ts`, `src/lib/icon.test.ts`

**Interfaces:**

- Consumes: `t`, keys `toolbar.name`, `toolbar.signInAgain`, `popup.signInAgain`, `popup.openSettings`.
- Produces:
  - `isAuthFailure(error: unknown): boolean`
  - `type Answer = 'held' | 'not-held' | 'unknown' | 'unauthorized'`
  - `SavedState.get(url): Promise<Answer>`, `SavedState.mark(url, held): void`, `SavedState.reset(): void`
  - `createSavedState({ look, now, isUnauthorized? })` — `look` still resolves `boolean` and rejects on failure
  - `setTitle(title: string, tabId?: number): Promise<void>` in `src/lib/icon.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/api/errors.test.ts` — add to the existing file:

```ts
import { isAuthFailure } from './errors';

describe('isAuthFailure', () => {
  it('is true for the two statuses that mean the token is no good', () => {
    expect(isAuthFailure(new HrcekApiError(401, 'HRC-AUTH-0003', 'Sign in.'))).toBe(true);
    expect(isAuthFailure(new HrcekApiError(403, 'HRC-AUTH-0004', 'Not allowed.'))).toBe(
      true,
    );
  });

  it('is false for everything else, including being unable to ask', () => {
    expect(isAuthFailure(new HrcekApiError(404, 'HRC-CORE-0003', 'Gone.'))).toBe(false);
    expect(isAuthFailure(new HrcekNetworkError('No route.'))).toBe(false);
    expect(isAuthFailure(new Error('boom'))).toBe(false);
  });
});
```

`src/lib/saved-state.test.ts` — the harness gains a classifier, and the
existing cases change their `true`/`false`/`null` expectations to
`'held'`, `'not-held'` and `'unknown'`:

```ts
import { HrcekApiError, HrcekNetworkError, isAuthFailure } from './api/errors';

function harness(answers: (url: string) => Promise<boolean>) {
  let clock = 0;
  const look = vi.fn(answers);
  const state = createSavedState({
    look,
    now: () => clock,
    isUnauthorized: isAuthFailure,
  });
  return { state, look, tick: (ms: number) => (clock += ms) };
}

it('tells a refused token apart from being unable to ask', async () => {
  const { state } = harness(async () => {
    throw new HrcekApiError(401, 'HRC-AUTH-0003', 'You must sign in to do that.');
  });

  expect(await state.get('https://example.com/a')).toBe('unauthorized');
});

it('stops asking once the token has been refused', async () => {
  // A dead token asked about once per tab is a dead token asked about
  // all day, and not one of those requests can succeed.
  const { state, look } = harness(async () => {
    throw new HrcekApiError(401, 'HRC-AUTH-0003', 'You must sign in to do that.');
  });

  await state.get('https://example.com/a');
  await state.get('https://example.com/b');

  expect(look).toHaveBeenCalledTimes(1);
  expect(await state.get('https://example.com/c')).toBe('unauthorized');
});

it('asks again after settings change', async () => {
  let refuse = true;
  const { state, look } = harness(async () => {
    if (refuse) throw new HrcekApiError(401, 'HRC-AUTH-0003', 'Sign in.');
    return true;
  });

  await state.get('https://example.com/a');
  refuse = false;
  state.reset();

  expect(await state.get('https://example.com/a')).toBe('held');
  expect(look).toHaveBeenCalledTimes(2);
});

it('keeps answering "unknown" for a blip, which is not an answer', async () => {
  const { state, look } = harness(async () => {
    throw new HrcekNetworkError('No route to host.');
  });

  expect(await state.get('https://example.com/a')).toBe('unknown');
  expect(await state.get('https://example.com/b')).toBe('unknown');
  // Not latched: "we could not ask" is not "your token is dead".
  expect(look).toHaveBeenCalledTimes(2);
});
```

`src/lib/icon.test.ts`:

```ts
import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setTitle } from './icon';

it('names the button, so a refused token has somewhere to say so', async () => {
  // A tooltip is the only text a toolbar button has.
  const titles: string[] = [];
  vi.spyOn(fakeBrowser.action, 'setTitle').mockImplementation(
    async (details: { title: string }) => {
      titles.push(details.title);
    },
  );

  await setTitle('Hrček: sign in again', 7);
  expect(titles).toEqual(['Hrček: sign in again']);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/lib`
Expected: FAIL — `isAuthFailure` is not exported; `Answer` does not exist.

- [ ] **Step 3: Name the failure**

`src/lib/api/errors.ts`, at the end:

```ts
/**
 * Whether the server refused the credential rather than the request. A
 * revoked or expired token looks like this, and nothing else does —
 * being unable to reach the server is not a refusal.
 */
export function isAuthFailure(error: unknown): boolean {
  return error instanceof HrcekApiError && (error.status === 401 || error.status === 403);
}
```

- [ ] **Step 4: Teach the cache a third answer**

`src/lib/saved-state.ts`:

```ts
/** What is known about an address. */
export type Answer = 'held' | 'not-held' | 'unknown' | 'unauthorized';

export interface SavedState {
  /** What is known, asking the server when the cache cannot say. */
  get(url: string): Promise<Answer>;
  /** Record an answer already known — a save just made, say. */
  mark(url: string, held: boolean): void;
  /** Forget everything, including a refusal. For a settings change. */
  reset(): void;
}

export function createSavedState(options: {
  look(url: string): Promise<boolean>;
  now(): number;
  /** Which failures mean "the token is no good", not "not just now". */
  isUnauthorized?(error: unknown): boolean;
}): SavedState {
  const cache = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<Answer>>();
  // Latched, not cached per address: a refused token refuses every
  // address, and asking once per tab would be a request a minute that
  // cannot succeed. Cleared by reset(), which a settings change calls.
  let unauthorized = false;

  // … remember() unchanged …

  return {
    async get(url: string): Promise<Answer> {
      if (unauthorized) return 'unauthorized';
      const cached = cache.get(url);
      if (cached !== undefined && options.now() - cached.at < CACHE_TTL_MS) {
        return cached.held ? 'held' : 'not-held';
      }
      // Two tabs on the same address should cost one request, not two.
      const pending = inFlight.get(url);
      if (pending !== undefined) return pending;

      const request = options
        .look(url)
        .then(
          (held): Answer => {
            remember(url, held);
            return held ? 'held' : 'not-held';
          },
          (error: unknown): Answer => {
            // Not remembered: a failure must not harden into an answer.
            if (options.isUnauthorized?.(error) === true) {
              unauthorized = true;
              return 'unauthorized';
            }
            return 'unknown';
          },
        )
        .finally(() => inFlight.delete(url));

      inFlight.set(url, request);
      return request;
    },

    mark(url: string, held: boolean): void {
      remember(url, held);
    },

    reset(): void {
      unauthorized = false;
      cache.clear();
    },
  };
}
```

- [ ] **Step 5: Give the toolbar button a voice**

`src/lib/platform/action.ts` — the interface gains one method:

```ts
interface ToolbarAction {
  setIcon(details: { path: Record<number, string>; tabId?: number }): Promise<void>;
  setTitle(details: { title: string; tabId?: number }): Promise<void>;
}
```

`src/lib/icon.ts`:

```ts
/**
 * The button's tooltip — the only text a toolbar button has, and so the
 * only place a refused token can say so without a notification.
 */
export async function setTitle(title: string, tabId?: number): Promise<void> {
  try {
    await toolbarAction().setTitle({
      title,
      ...(tabId === undefined ? {} : { tabId }),
    });
  } catch {
    // The tab is gone. Nothing to name.
  }
}
```

- [ ] **Step 6: Paint the refusal**

`src/entrypoints/background.ts`:

```ts
import { isAuthFailure } from '../lib/api/errors';
import { setIcon, setTitle, type IconState } from '../lib/icon';
import { createTranslator, localeFor, type Translator } from '../lib/i18n';

let t: Translator = createTranslator(localeFor(null));

/** Re-read whenever settings change: the language may have changed too. */
async function refreshLanguage(): Promise<void> {
  const settings = await loadSettings();
  t = createTranslator(localeFor(settings?.language ?? null));
}

const savedState = createSavedState({
  look: async (url) => {
    const settings = await loadSettings();
    if (settings === null || settings.token === null) throw new Error('not configured');
    return (
      (await loadExisting(
        clientFromSettings(settings, localeFor(settings.language)),
        url,
      )) !== null
    );
  },
  now: () => Date.now(),
  isUnauthorized: isAuthFailure,
});
```

`paint` names the button and branches on the answer:

```ts
// Colour until proven ticked. A failure leaves it here: "we could not
// ask" is not "you have not saved it".
await setIcon('configured', tabId);
await setTitle(t('toolbar.name'), tabId);
clearTimeout(pending);
pending = setTimeout(() => {
  void savedState.get(url).then(async (answer) => {
    if (answer === 'unauthorized') {
      // Grey, like unconfigured — because in every way that matters it
      // is: nothing works until there is a new token. The tooltip says
      // which of the two it is.
      await setIcon('unconfigured', tabId);
      await setTitle(t('toolbar.signInAgain'), tabId);
      return;
    }
    const state: IconState = answer === 'held' ? 'saved' : 'configured';
    await setIcon(state, tabId);
  });
}, LOOKUP_DELAY_MS);
```

and the settings listener clears the latch:

```ts
browser.storage.local.onChanged.addListener((changes) => {
  if (!('settings' in changes)) return;
  // A new token deserves a fresh ask, and the language may have
  // changed with it.
  savedState.reset();
  void refreshLanguage().then(() => {
    void paintGlobal();
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id !== undefined) void paint(tab.id, tab.url);
    });
  });
});
```

with `void refreshLanguage();` at the top of `defineBackground`, beside
`void paintGlobal();`.

- [ ] **Step 7: Say it in the popup too**

`src/entrypoints/popup/main.ts` — the catch in `main()` branches:

```ts
  } catch (error) {
    if (isAuthFailure(error)) {
      // Nothing on this form can succeed until there is a new token.
      renderUnauthorized();
      return;
    }
    lookupFailed = true;
    renderForm(emptyForm(url, title, definitions), false);
    setStatus('error', messageFor(error));
  }
```

```ts
function renderUnauthorized(): void {
  app.innerHTML = `
    <div class="hrcek-header">
      <img src="/icon/32.png" alt="" />
      <span class="name">Hrček</span>
    </div>
    <p>${escapeText(t('popup.signInAgain'))}</p>
    <button id="open-options">${escapeText(t('popup.openSettings'))}</button>
  `;
  document
    .querySelector<HTMLButtonElement>('#open-options')!
    .addEventListener('click', () => browser.runtime.openOptionsPage());
}
```

- [ ] **Step 8: Run everything**

Run: `pnpm test && pnpm test:e2e`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib src/entrypoints
git commit -m "feat: say when Hrček stopped accepting the token"
```

---

## Task 11: A cache that survives Chrome's worker

**Files:**

- Create: `src/lib/platform/session-store.ts`, `src/lib/platform/session-store.test.ts`
- Modify: `src/lib/saved-state.ts`, `src/entrypoints/background.ts`
- Test: `src/lib/saved-state.test.ts`

**Interfaces:**

- Consumes: `Answer`, `createSavedState` from Task 10.
- Produces:
  - `interface StateStore { read(): Promise<Record<string, Entry>>; write(entries: Record<string, Entry>): Promise<void> }`
  - `sessionStore(key: string): StateStore`
  - `createSavedState({ look, now, isUnauthorized?, store? })`
  - `Entry` exported from `src/lib/saved-state.ts`

- [ ] **Step 1: Write the failing store test**

Create `src/lib/platform/session-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { sessionStore } from './session-store';

describe('sessionStore', () => {
  beforeEach(() => fakeBrowser.reset());

  it('round-trips through storage.session when the browser has one', async () => {
    const store = sessionStore('saved-state');
    await store.write({ 'https://example.com/a': { held: true, at: 10 } });

    expect(await store.read()).toEqual({
      'https://example.com/a': { held: true, at: 10 },
    });
  });

  it('answers an empty record before anything was written', async () => {
    expect(await sessionStore('saved-state').read()).toEqual({});
  });

  it('keeps working where there is no storage.session', async () => {
    // Firefox before 115, and anything else that lacks it. The badge
    // still works; it just forgets when the context does.
    const storage = fakeBrowser.storage as unknown as Record<string, unknown>;
    const area = storage['session'];
    delete storage['session'];
    try {
      const store = sessionStore('saved-state');
      await store.write({ 'https://example.com/b': { held: false, at: 3 } });
      expect(await store.read()).toEqual({
        'https://example.com/b': { held: false, at: 3 },
      });
    } finally {
      storage['session'] = area;
    }
  });
});
```

If `fakeBrowser` has no `storage.session` at all, invert the first two
cases: assert the in-memory fallback by default, and stub a session area
onto `fakeBrowser.storage` for the round-trip case. Either way, both
paths must be covered.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/platform/session-store.test.ts`
Expected: FAIL — `Cannot find module './session-store'`.

- [ ] **Step 3: Write the store**

Create `src/lib/platform/session-store.ts`:

```ts
import { browser } from 'wxt/browser';
import type { Entry } from '../saved-state';

/**
 * Somewhere to keep answers that must not outlive the browser. Rung
 * three of the browser ladder: `storage.session` is memory-resident and
 * never written to disk, which is exactly right here — but Chrome's MV3
 * worker needs it and an older Firefox does not have it, and no
 * build-time switch can tell which is which.
 */
export interface StateStore {
  read(): Promise<Record<string, Entry>>;
  write(entries: Record<string, Entry>): Promise<void>;
}

interface SessionArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function sessionArea(): SessionArea | undefined {
  const storage = browser.storage as unknown as { session?: SessionArea };
  return storage.session;
}

export function sessionStore(key: string): StateStore {
  const area = sessionArea();
  if (area === undefined) {
    // Nothing persistent to use, which is exactly what this code did
    // before session storage existed.
    let memory: Record<string, Entry> = {};
    return {
      read: async () => memory,
      write: async (entries) => {
        memory = entries;
      },
    };
  }
  return {
    async read() {
      const stored = await area.get(key);
      return (stored[key] as Record<string, Entry> | undefined) ?? {};
    },
    async write(entries) {
      await area.set({ [key]: entries });
    },
  };
}
```

- [ ] **Step 4: Write the failing saved-state tests**

Add to `src/lib/saved-state.test.ts`:

```ts
import type { StateStore } from './platform/session-store';
import type { Entry } from './saved-state';

function backedStore(initial: Record<string, Entry> = {}): StateStore {
  let backing = initial;
  return {
    read: async () => backing,
    write: async (entries) => {
      backing = entries;
    },
  };
}

it('finds what an earlier worker already asked', async () => {
  // Chrome kills the MV3 worker after 30 seconds idle. Without this,
  // every tab switch after a pause costs a request the server has
  // already answered.
  const store = backedStore();
  const first = createSavedState({ look: async () => true, now: () => 0, store });
  expect(await first.get('https://example.com/a')).toBe('held');

  // A new worker over the same session storage, and a look that would
  // throw if it were called at all.
  const look = vi.fn(async () => {
    throw new Error('should not ask again');
  });
  const second = createSavedState({ look, now: () => 1000, store });

  expect(await second.get('https://example.com/a')).toBe('held');
  expect(look).not.toHaveBeenCalled();
});

it('still lets a stored answer go stale', async () => {
  const store = backedStore({ 'https://example.com/a': { held: true, at: 0 } });
  const look = vi.fn(async () => false);
  const state = createSavedState({ look, now: () => CACHE_TTL_MS + 1, store });

  expect(await state.get('https://example.com/a')).toBe('not-held');
  expect(look).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Hydrate from the store**

`src/lib/saved-state.ts` — export `Entry`, accept the store, and read it
once per context:

```ts
export interface Entry {
  held: boolean;
  at: number;
}

export function createSavedState(options: {
  look(url: string): Promise<boolean>;
  now(): number;
  isUnauthorized?(error: unknown): boolean;
  /** Where answers outlive this context. Absent means memory only. */
  store?: StateStore;
}): SavedState {
  const cache = new Map<string, Entry>();
  …
  // Read once per context, not per lookup: this is a worker that may
  // have just started, not a cache that changes underneath us.
  let hydrated: Promise<void> | null = null;
  function hydrate(): Promise<void> {
    if (hydrated === null) {
      hydrated =
        options.store === undefined
          ? Promise.resolve()
          : options.store.read().then((entries) => {
              for (const [url, entry] of Object.entries(entries)) {
                // Anything learned since the read wins: it is newer.
                if (!cache.has(url)) cache.set(url, entry);
              }
            });
    }
    return hydrated;
  }

  function remember(url: string, held: boolean): void {
    cache.delete(url);
    cache.set(url, { held, at: options.now() });
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    // Write-through, fire and forget: a lost write costs one request.
    void options.store?.write(Object.fromEntries(cache));
  }
```

`get()` starts with `await hydrate();`, and `reset()` clears the store
too:

```ts
    reset(): void {
      unauthorized = false;
      cache.clear();
      hydrated = null;
      void options.store?.write({});
    },
```

Import type only — `import type { StateStore } from './platform/session-store';` —
so `lib/saved-state.ts` keeps no runtime dependency on the platform
module.

- [ ] **Step 6: Use it in the background**

`src/entrypoints/background.ts`:

```ts
import { sessionStore } from '../lib/platform/session-store';

const savedState = createSavedState({
  look: async (url) => { … },
  now: () => Date.now(),
  isUnauthorized: isAuthFailure,
  // Chrome's MV3 worker dies after 30 seconds idle; without this it
  // re-asks the server about every tab it has already asked about.
  store: sessionStore('saved-state'),
});
```

- [ ] **Step 7: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/platform/session-store.ts src/lib/platform/session-store.test.ts src/lib/saved-state.ts src/lib/saved-state.test.ts src/entrypoints/background.ts
git commit -m "feat: keep the badge's answers across a sleeping worker"
```

---

## Task 12: Ready to ship on both stores

**Files:**

- Create: `docs/store/permissions.md`, `docs/store/privacy.md`
- Modify: `package.json`, `wxt.config.ts`, `README.md`, `CLAUDE.md`

**Interfaces:**

- Consumes: the verdict from Task 1's report.
- Produces: `pnpm zip:chrome`.

- [ ] **Step 1: Add the Chrome zip script**

`package.json`, beside `"zip"`:

```json
    "zip": "wxt zip -b firefox",
    "zip:chrome": "wxt zip -b chrome",
```

- [ ] **Step 2: Build both zips**

Run: `pnpm zip && pnpm zip:chrome`
Expected: both succeed; `.output/` holds a Firefox and a Chrome zip.

- [ ] **Step 3: Prove no test code shipped**

```bash
unzip -l .output/*chrome*.zip | grep -Ei "test|spec|fake" || echo "clean"
unzip -l .output/*firefox*.zip | grep -Ei "test|spec|fake" || echo "clean"
```

Expected: `clean` for both. A match means an entrypoint imports a test
file — fix that before going further.

- [ ] **Step 4: Write the permission justifications**

Create `docs/store/permissions.md`, using the built manifest
(`.output/chrome-mv3/manifest.json`) as the source and Task 1's report
for the optional host permission:

```markdown
# Permissions, and why each one is asked for

Written for a store reviewer. Each entry says what the extension does
with the permission, and what stops working without it.

## `activeTab`

Reads the address and title of the tab you are on, at the moment you
click the extension's button, so the popup can offer to save that page.
It also allows the two on-demand scripts: the one that reads which
pictures the page offers, and the one that shows the confirmation after
a save. Neither is registered to run on page load — nothing runs on a
page until you press the button.

## `storage`

Keeps the server address, the API token and the preferences in
`storage.local`. Never `storage.sync`, which is replicated and
unencrypted.

## `tabs`

The toolbar button ticks the hamster on a page you have already saved.
Deciding that needs each tab's address as you browse, which `activeTab`
does not provide — it reveals a tab's URL only after a click on that
tab. It grants no access to page content. Switched off entirely when
"Show whether a page is already saved" is turned off in settings.

## `scripting` (Chrome only)

Runs the two on-demand scripts above. Firefox reaches the same thing
through `tabs.executeScript`, which `activeTab` already covers.

## `<all_urls>`, optional and requested at runtime

Not held at install. The Hrček server's address is configured by the
person using the extension and can be any host, so its origin is asked
for from the settings page the moment it is saved. The extension talks
to no other host.
```

- [ ] **Step 5: Write the privacy statement**

Create `docs/store/privacy.md`:

```markdown
# What leaves your browser

The extension talks to exactly one server: the Hrček you configured in
its settings. Nothing is sent anywhere else, and there is no analytics,
telemetry or error reporting of any kind.

**Sent to your Hrček, when you save a page:** its address, the title,
your notes, tags, the values of your own fields, and a picture if you
chose one. When the toolbar's saved-state indicator is on, the address
of a page you visit is also sent, to ask whether you already hold it.
That indicator can be switched off in settings, and then nothing is
sent until you press Save.

**Kept in the browser:** the server address, the API token and your
preferences, in `storage.local` — local to the machine, never synced.

**Never kept:** your password. It is used once, to ask Hrček for a
token, and is written nowhere.

**Never collected:** browsing history, page contents, form data, or
anything at all while the extension is idle.
```

- [ ] **Step 6: Settle the gecko id**

`wxt.config.ts` holds `gecko: { id: 'hrcek@samastur.com' }`, marked as a
placeholder. It is a valid, unique id and can ship as it stands; what it
cannot do is change after the first AMO upload.

**Checkpoint — ask Marko:** keep `hrcek@samastur.com`, or use a
different id before first submission? On his answer, either drop the
"Placeholder AMO id" comment or replace the id. Do not decide this
alone.

- [ ] **Step 7: Update the docs**

`README.md` and `CLAUDE.md`: add `pnpm zip:chrome` to the commands; say
Chrome is a verified target rather than only a build; note that the
language is chosen in settings and otherwise follows the browser; point
at `docs/store/` for the store paperwork.

- [ ] **Step 8: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add package.json wxt.config.ts docs/store README.md CLAUDE.md
git commit -m "docs: what the extension asks for, and what it sends"
```

---

## Task 13: See it work in both browsers

The suites cover Chromium headlessly. Firefox's MV2 build is covered by
unit tests and by this. Everything here is what a person would notice
and a headless test would not.

**Files:**

- Create: `docs/reports/2026-09-23-v3-smoke.md`

**Interfaces:**

- Consumes: everything above.
- Produces: a record of what was seen, and a list of anything that was not right.

- [ ] **Step 1: Firefox**

Run: `pnpm dev`

In the browser that opens, work through:

1. Settings: set the server address and a token; press Save and accept the origin prompt.
2. Set the language to Slovenščina. The page re-renders in Slovenian at once; reload and it stays.
3. On an ordinary article page, open the popup: it is in Slovenian, and it offers the pictures the page declares.
4. Save. The popup closes on its own and a toast appears at the top right of the page.
5. Reopen the popup on the same page: "Že shranjeno", and the toolbar hamster is ticked.
6. Choose a different picture and save: the popup says "Shranjujem sliko…", then closes, and the toast confirms.
7. Set the language back to Automatic and confirm the popup follows the browser.
8. Open the popup on a PDF and on `about:support`: saving still closes the popup, and nothing reports an error for the missing toast.
9. Break the token (edit it to nonsense in settings) and browse: the hamster goes grey and its tooltip says to sign in again; the popup says so too and offers settings. Restore the token: the button returns to colour.

- [ ] **Step 2: Chrome**

Run: `pnpm dev:chrome`

Repeat every step above, then two that only matter here:

10. Save a page, then leave the browser idle for a minute so the MV3 worker is killed (`chrome://serviceworker-internals` shows it stopped). Switch back to that tab: the hamster is still ticked, and the Network panel shows no fresh `by-url` request — the session store answered.
11. Check the service worker's console for unhandled rejections after a save. There should be none: the `hrcek:saved` message is caught.

- [ ] **Step 3: Write it down**

Create `docs/reports/2026-09-23-v3-smoke.md`: both browser versions,
each numbered step with what happened, and a plain list of anything that
did not match. Anything that did not match is a bug to fix before this
branch is finished, not a note to file away.

- [ ] **Step 4: Commit**

```bash
git add docs/reports/2026-09-23-v3-smoke.md
git commit -m "docs: what v3 does in a real Firefox and a real Chrome"
```

---

## Self-Review

**Spec coverage.** Language: catalogue (T2), `Accept-Language` (T3),
settings (T4), selector and options page (T5), popup (T6), background
tooltips (T10). Auto-close: the toast (T7), the close sequence and the
failed-entry exception (T8), unscriptable pages (T7's `showToast`, seen
in T13). Errors: fields banner and the two warns (T9), the unshowable
held picture (T6), the dead token (T10). Chrome: manifest verification
(T1), worker lifetime (T11), zips and store paperwork (T12), real-browser
verification (T13). Testing: unit tests in T2, T3, T7, T10, T11; e2e in
T5, T8, T9; the fake's translation in T3.

**Known gaps, stated rather than hidden.** The cross-tab toast is proven
in e2e through a seam (`targetTabId` under `--mode e2e`) rather than by
clicking a real toolbar button, which Playwright cannot do — Task 13
step 4 is what covers the real gesture. The Slovenian strings are a
first pass, flagged for review in Task 2. The gecko id in Task 12 is a
checkpoint, not a decision taken here.

**Type consistency.** `Translator` and `MessageKey` (T2) are used
unchanged in T3, T5, T6, T10. `Answer` (T10) is what T11's tests assert.
`Entry` is exported from `saved-state.ts` in T11 and imported as a type
by `session-store.ts`; `StateStore` is defined once, in
`session-store.ts`, and imported as a type by `saved-state.ts`.
`showToast(tabId, text, kind)` (T7) is called with exactly that
signature in T8. `isAuthFailure` (T10) is used by the background, the
popup, and `saved-state`'s classifier.
