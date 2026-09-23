# Hrček extension v3 — design

Date: 2026-09-23
Status: approved

Builds on [v1](2026-09-16-hrcek-extension-design.md), which still
describes the architecture, the auth story and the build setup, and on
[v2](2026-09-22-hrcek-extension-v2-design.md), which describes the
popup as it stands. This document covers only what changes.

## Purpose

v2 saves a page well but talks to you badly. It speaks English at a
person whose Hrček answers in Slovenian, it makes you close its own
window after a save, it swallows failures that a person could have
done something about, and it is a Firefox extension that happens to
compile for Chrome rather than one that runs there.

Four pieces of work:

1. A language the user chooses, for the extension's own words and for
   the server's.
2. A popup that closes itself, confirming on the page instead.
3. Failures that are reported when a person can act on them.
4. Chrome as a target that is verified, not merely built.

## 1. Language

### What the server offers

Error messages are translated; `Accept-Language: sl` gets Slovenian,
and anything unrecognised falls back to English (`../hrcek/docs/dev/api.md`,
"Languages"). The server carries `en` and `sl` today. Codes never
change, which is why the client branches on `code` and shows `message`
— unchanged here, and now the `message` arrives in the right language.

### Why not `_locales`

`browser.i18n.getMessage` reads the **browser's** UI locale and cannot
be overridden at runtime. A language the user picks inside the
extension therefore cannot come from `_locales`; it needs a catalogue
this code looks up itself.

Manifest `name` and `description` localization is **out of scope** for
the same reason: it can only follow the browser's UI locale, so it
would contradict the choice made in settings. The extension is named
Hrček in every language regardless.

### The catalogue

```
src/lib/i18n/
  index.ts            resolveLocale, loadCatalogue, createTranslator
  catalogues.ts       the registry: locale tag -> imported JSON
  messages/en.json    the source of truth; every key exists here
  messages/sl.json    a translation; missing keys fall back to en
```

`messages/en.json` is flat: `"popup.save": "Save"`. Placeholders are
named and braced — `"toast.savedNoPicture": "Saved — the picture could
not be attached: {reason}"` — substituted by the translator, never by
string concatenation at the call site.

A catalogue that lacks a key falls back to English for that key alone,
so a half-finished translation degrades word by word instead of all at
once. A missing key in **English** is a programming error: the
translator returns the key itself and `console.warn`s, and a unit test
asserts every other catalogue's keys are a subset of English's.

Adding a language is one JSON file and one line in `catalogues.ts`.
Nothing else in the codebase learns about it.

### Resolution

```
Settings.language: string | null   // null = Automatic
```

`resolveLocale(chosen, uiLocale, available)` answers the tag to use:

1. `chosen` when it is not null and a catalogue exists for it.
2. Otherwise the browser's UI locale (`browser.i18n.getUILanguage()`),
   matched first exactly (`sl-SI`), then by its base tag (`sl`).
3. Otherwise `en`.

The resolved tag is what the UI renders in **and** what goes out as
`Accept-Language`. A locale the catalogue has but the server does not
is still sent; the server's own fallback makes that safe, and it is
what lets the catalogue grow past the server's two languages.

Resolution is pure and lives in `lib/i18n`, so it is tested without a
browser.

A context with no settings at all — the popup on a fresh install,
which renders "Hrček is not configured yet" — resolves with `chosen`
as `null`, so it speaks the browser's language. There is no state in
which the extension has nothing to say.

### Where it is used

Every user-visible string in `src/entrypoints/popup/`,
`src/entrypoints/options/`, the new toast, and the background's
toolbar tooltips moves behind the translator. The translator is
created once per context, after settings load, and passed down —
`lib/` code is handed a translator, it does not reach for a global.

The API client gains an optional `acceptLanguage` constructor argument
and sends the header when it is set. `client-factory` supplies the
resolved locale. `anonymousClient` does too: a refused token mint is
exactly the message a person needs in their own language.

### The selector

The options page gains a `<select>` above the saved-state switch:

- **Automatic (English)** — the resolved language named in
  parentheses, so "automatic" is never a mystery. `value=""`, stored
  as `null`.
- **English**, **Slovenščina** — each named in its own language, which
  is the only naming that works for somebody who has landed in a
  language they cannot read.

Changing it re-renders the options page immediately in the new
language. The popup and background pick it up on their next open,
which for the popup is its next opening and for the background is the
`storage.local.onChanged` listener it already has.

### Migration

Settings written before this change have no `language`. `loadSettings`
reads it as `null`, which is Automatic — the behaviour those users
already have. No migration step, same shape as `showSavedState`
before it.

## 2. Auto-close and the in-page toast

### Why the popup does this itself, not the background

Chrome serialises `runtime.sendMessage` payloads as JSON; a `Blob`
does not survive the trip (Firefox's structured clone would, but the
code has to work on both). The popup fetches picture bytes under
`activeTab` precisely because the server refuses to fetch many
addresses itself, so those bytes exist only in the popup and cannot be
handed to a background script to finish with.

So the popup finishes its own work and then closes. The background is
not involved in the toast at all, which also removes any question
about whether an `activeTab` grant outlives the popup that earned it.

### Sequence

```
save()
  entry POST succeeds
    no picture change  -> close now
    picture chosen     -> status "Saving picture…", upload, then close
  inject toast.js into the active tab
  send it the translated text
  window.close()
```

The close trigger is the entry being stored. The single exception is a
picture upload, which cannot outlive the popup, so the popup waits the
second or two it takes. The user never closes the popup by hand in
either case.

**An entry that did not save keeps the popup open**, showing today's
status line, because that is the case where the person must act:
a bad token, an unreachable server, a validation refusal. A picture
that failed while the entry stood is reported in the toast and the
popup still closes — the entry is saved, which is what was asked for.

### The toast

New unlisted entrypoint `src/entrypoints/toast.ts`, injected on demand
through `lib/platform/inject.ts` — the same ladder rung and the same
`activeTab` grant `harvest.ts` already rides, so **no new permission
is required**.

- Renders into a **shadow root** attached to `document.documentElement`,
  so no page stylesheet can reach it and it survives pages that restyle
  `body`.
- Fixed top-right, `z-index` at the top of the stacking order, inert to
  pointer events except its own dismiss.
- Auto-dismisses after 3 seconds; `prefers-reduced-motion` drops the
  fade, `prefers-color-scheme` picks light or dark from the same tokens
  as `lib/ui/theme.css`.
- Guards against double injection with the `__hrcekToastReady` flag, the
  way `harvest.ts` does, and replaces the text of a toast already
  showing rather than stacking a second one.
- Answers with `sendResponse` and `return true` — never a returned
  Promise, which Chrome discards.

It receives text already translated. The toast knows nothing about
locales; the popup resolved that before it opened.

### Pages that cannot host a toast

A PDF viewer, `chrome://`, `about:`, the Web Store: injection throws.
That throw is caught and ignored — the popup closes regardless, and the
ticked toolbar icon is the confirmation. A page that cannot be scripted
is not a save that failed.

## 3. Errors reported when a person can act

An audit of what is swallowed today, and what each becomes:

| Today                                                                     | Becomes                                                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `listFields()` failure → `null`, fields silently vanish (`popup/main.ts`) | A banner: "Your fields could not be loaded — saving will not change them." True, because `fields` is patched and omitted keys keep their values. |
| Held picture fetch fails → tile implies no picture (`popup/main.ts`)      | The tile says the entry has a picture that could not be shown.                                                                                   |
| Every background lookup failure → `null` (`lib/saved-state.ts`)           | Auth failures get their own path. See below.                                                                                                     |
| Tag suggestions fail → suggestions cleared (`popup/chips.ts`)             | Unchanged, plus a `console.warn`. A convenience whose absence is self-evident.                                                                   |
| Page harvest fails → no candidates (`lib/page/harvest-client.ts`)         | Unchanged, plus a `console.warn`. Same reason; a PDF has no pictures to offer and saying so every time would be noise.                           |

### The dead-token state

A revoked or expired token is invisible today: `saved-state.ts` turns
every failure into `null`, the icon stays neutral, and nothing says
why saving will fail until the person tries.

`createSavedState`'s `look` gains a third answer. Its callback may
throw a distinguishable auth failure — `HrcekApiError` with status 401
or 403 — and the state machine reports `'unauthorized'` rather than
`null`. On that answer:

- The toolbar shows the unconfigured (grey) icon with the title
  "Hrček: sign in again".
- Further lookups stop until settings change. A dead token asked about
  once a tab is a dead token asked about all day.
- The popup, on open, shows that message and a button to settings
  instead of a form. It already loads settings before anything else;
  this is one more branch beside `renderUnconfigured`.

`storage.local.onChanged` already repaints on a settings change, which
is what clears the state.

Non-auth failures keep today's behaviour exactly: "we could not ask" is
not "you have not saved it", and the icon stays colour.

## 4. Chrome

Chrome builds today (`pnpm build:chrome`, 149 kB). What is missing is
correctness under MV3's service worker, verification in a real
browser, and the paperwork to ship.

### Service-worker lifetime

The badge's cache lives in a `Map` inside the background script. On
Firefox MV2 the background is persistent and that Map lives as long as
the browser. On Chrome MV3 the worker is killed after 30 seconds idle,
so the cache is empty again on the next tab switch and the server is
asked about addresses it just answered for.

`createSavedState` gains an injected store behind a small interface:

```ts
interface StateStore {
  read(): Promise<Record<string, Entry>>;
  write(entries: Record<string, Entry>): Promise<void>;
}
```

`storage.session` backs it where available — it is memory-resident, not
written to disk, which is the right place for answers that must not
outlive a browser restart. Where it is absent the store is an in-memory
object and behaviour is exactly today's. Rung three of the browser
ladder: a shared interface with a platform-chosen implementation.

The eviction rules (`CACHE_TTL_MS`, `CACHE_LIMIT`) are unchanged and
still enforced on read, since a stored entry can age while the worker
is dead.

The 400 ms debounce stays a `setTimeout`. `chrome.alarms` has a 30
second floor and is the wrong tool; a worker suspended mid-debounce
simply does not repaint, and the next `tabs.onActivated` paints it.

### Verification, not assumption

The load-bearing unknown is whether Chrome accepts
`optional_host_permissions: ['<all_urls>']`, which the entire
runtime-origin flow depends on. This is a load-the-unpacked-extension
check in real Chrome, and it is the **first** task of this workstream:
if Chrome refuses it, the origin-permission design changes and
everything after it is affected.

Beyond that: `pnpm dev:chrome` smoke checks of the save flow, the
badge, the options page and the new toast, on a real page and on a
page that cannot be scripted.

### Shipping

- `pnpm zip:chrome` beside the existing Firefox `zip`.
- `docs/store/permissions.md` — a justification per permission, in the
  form the Web Store review asks for: `activeTab`, `storage`, `tabs`,
  `scripting`, and the optional `<all_urls>`.
- `docs/store/privacy.md` — what leaves the browser and where it goes.
  The honest answer is short: addresses and page titles go to the
  Hrček the user configured, nothing goes anywhere else, the token
  never leaves `storage.local`, and the password is never stored.
- The deferred AMO cleanup: a real gecko id in `wxt.config.ts`.

## Testing

TDD: every behaviour below starts as a failing test.

**Unit** (colocated, Vitest):

- `resolveLocale` — chosen wins, browser locale matched exactly then by
  base tag, `en` last.
- Catalogue completeness — every non-English catalogue's keys are a
  subset of English's; every key English has is a non-empty string.
- Translator substitution, missing-key fallback, missing-English-key
  warning.
- `HrcekClient` sends `Accept-Language` when given one and omits the
  header when not.
- `createSavedState` — `unauthorized` is distinct from `null`, stops
  further lookups, and is cleared by a settings change.
- The session-backed store — survives a simulated worker restart,
  still evicts by TTL and limit.
- The toast — shadow root, single instance, text replacement, dismissal.

**e2e** (Playwright, Chrome, against the fake Hrček):

- Saving closes the popup and a toast appears on the page.
- A page that cannot be scripted still closes the popup.
- The language selector changes the options page's own words.

**Fake Hrček**: grows a Slovenian message for one error code, keyed on
the request's `Accept-Language`, so the header's effect is provable end
to end rather than asserted on the outgoing request alone.

## What this does not do

- Manifest `name`/`description` localization (browser-locale-bound; see
  above).
- Any language beyond `en` and `sl`. The catalogue is built to take
  more; adding one is not this work.
- An offline save queue. `submitSave` remains the seam for it.
- Safari.
