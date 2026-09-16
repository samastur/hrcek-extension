# Hrček browser extension — design

Date: 2026-09-16
Status: approved

## Purpose

Browser extensions for Firefox, Chrome, and Safari that act as clients
for the Hrček link-saving service (developed in `../hrcek`; API guide
at `../hrcek/docs/dev/api.md`, schema at
`../hrcek/docs/api/openapi.json`). Firefox ships first. One codebase;
adding a browser should be a build target, not a port.

## Scope of v1

A Firefox extension built with WXT:

- **Popup (toolbar button):** pre-filled with the active tab's URL and
  title. Before saving, the person can edit title, notes, tags, and
  their account's custom fields. On open, the popup calls
  `GET /api/entries/by-url/`; if the address is already held, the
  existing entry is loaded and shown, so saving is a conscious merge,
  not a blind replace. Save posts the whole entry
  (`POST /api/entries/` is replace-except-fields).
- **Options page:** server URL plus one of two auth modes (below),
  a "test connection" button (`GET /api/auth/me`), and a link to
  `/accounts/me/` on the configured server for creating tokens.
- **Failures are shown, never swallowed:** save errors appear in the
  popup with the server's translated `message`; logic branches on
  `code`, never on `message`.

Out of scope for v1, but designed for:

- **Offline queue.** The save flow has a single submit boundary where
  a local queue can slot in later. The popup will eventually grow a
  tab listing not-yet-synced items.
- Chrome and Safari builds, page-content capture, batch import.

## Architecture

### Repository layout

```
hrcek-extension/
├── CLAUDE.md              # working agreement for Claude
├── README.md
├── package.json           # pnpm, Node LTS
├── wxt.config.ts          # WXT config; firefox target first
├── tsconfig.json          # strict
├── src/
│   ├── lib/               # browser-agnostic core; all reusable logic
│   │   ├── api/           # typed Hrček client
│   │   │   └── types.gen.ts  # generated from openapi.json
│   │   ├── platform/      # per-browser implementations (see ladder)
│   │   ├── settings.ts    # server URL + auth config in storage.local
│   │   └── save.ts        # look-before-write save flow
│   └── entrypoints/       # WXT convention: popup/, options/, background.ts
├── tests/
│   ├── e2e/               # Playwright, Chromium + built extension
│   └── fake-hrcek/        # fake server: documented endpoints + error codes
├── docs/
│   └── superpowers/specs/
└── .github/workflows/ci.yml
```

Boundary rule: `src/lib/` never imports from `entrypoints/` and touches
browser APIs only through the WXT-provided `browser` polyfill.

### Browser-specific code: the ladder

Use the lowest rung that works; document exceptions in CLAUDE.md.

1. **Config:** `wxt.config.ts` emits a per-browser manifest (MV2 vs
   MV3 keys, `browser_specific_settings.gecko`, Chrome-only keys).
   No source divergence.
2. **Inline build-time switches:** `if (import.meta.env.FIREFOX)`
   for one-liners; compile-time constants, dead branches are
   tree-shaken from other targets.
3. **Platform modules:** `src/lib/platform/<capability>/` — a shared
   interface, per-browser implementations (`firefox.ts`, `chrome.ts`,
   `safari.ts`), an `index.ts` selecting one at build time. The rest
   of `lib/` imports only the interface.
4. **Whole entrypoints:** WXT entrypoints included/excluded per
   target, if a browser ever needs its own page.

Safari additionally needs a native Xcode wrapper
(`safari-web-extension-converter`) — a `safari/` directory at the repo
root when that work starts; the web-extension code inside is the same
build output.

### Firefox target

MV2 via WXT's `firefox-mv2` (the recommended AMO target today). Chrome
builds MV3 from the same source later.

## Configuration and authentication

Configuration is the server URL plus one of two auth modes, set on the
options page and kept in `browser.storage.local` — never
`storage.sync`, which is unencrypted and replicates to other machines.

- **Token mode (recommended):** a bearer token (`hrcek_…`), created by
  the person at `/accounts/me/`, stored in `storage.local`, sent as
  `Authorization: Bearer`.
- **Password mode:** `POST /api/auth/login` with
  `{identifier, password}` establishes a session; the browser's cookie
  jar holds the session cookie for the server origin. Session
  POSTs require Django's CSRF token, so this mode needs the `cookies`
  permission: the client reads the `csrftoken` cookie and sends
  `X-CSRFToken`, fetching a page first if the cookie is not yet set
  (Django only sets it when a page asks for it). **The password is
  never persisted:** it is used once to log in and discarded; when the
  session expires (~2 weeks by default) the person is re-prompted.
  Rationale: WebExtensions have no encrypted keystore; `storage.local`
  is plaintext in the profile, and encrypting with a key that also
  sits in the profile is obfuscation, not security.

The API client has an auth-strategy seam (token vs session) so the
save flow does not know which mode is active.

Noted for the future, not v1: a server endpoint exchanging credentials
for an API token would let password login degrade into token mode
after first use.

### Permissions

`activeTab` + `storage` in the manifest; `cookies` for password mode.
The configured server's origin is requested as an **optional** host
permission when settings are saved, so the manifest never asks for
`<all_urls>`.

## API client

- **Types generated, client hand-written.** `openapi-typescript`
  generates `types.gen.ts` from `openapi.json`, copied into the repo
  by a refresh script (`pnpm refresh-schema`) from
  `../hrcek/docs/api/openapi.json`. Drift from the server surfaces as
  type errors.
- The client is a thin, TDD'd fetch wrapper: `health()`, `me()`,
  `login()`, `getEntryByUrl()`, `saveEntry()`. It parses the error
  envelope `{error: {code, message, details}}` into a typed error and
  branches on `code`.
- API gotchas the client and UI must respect: save is an upsert whose
  status (201/200) distinguishes created from updated; omitted
  attributes are cleared **except `fields`, which is patched** (clear
  a field by sending `""`); field names match case-insensitively and
  come back in the owner's spelling; never hard-code field names —
  Price/Priority are only defaults.

## UI

Vanilla TypeScript with small DOM helpers; no framework. The popup is
structured as views so the future "unsynced items" tab is another view,
not a rewrite. Error display uses the server's translated `message`.

## Testing strategy

TDD throughout: tests are written before implementation.

- **Unit (Vitest + WXT's fakeBrowser):** `lib/` — client, settings,
  save flow. HTTP mocked with msw.
- **E2e (Playwright):** the built extension loaded in Chromium,
  running against the in-repo fake Hrček. Covers configure → save →
  re-save/merge → error display. The fake's responses are typed
  against `types.gen.ts` so it cannot quietly diverge from the schema.
- **Real environment:** `pnpm dev` runs the extension in real Firefox
  with auto-reload (WXT wraps web-ext). An opt-in integration run
  (`HRCEK_URL`/`HRCEK_TOKEN` env vars) executes the client's contract
  tests against a locally running real Hrček.
- **CI (GitHub Actions):** typecheck, lint, unit, e2e.

Production zips (`wxt zip`) contain only built entrypoints — tests and
fakes never ship. No obfuscation.

## Tooling

pnpm, TypeScript strict, ESLint (flat config) + Prettier, Vitest,
Playwright, WXT (Vite underneath).

## CLAUDE.md contents

For future sessions: what the project is; where the Hrček docs and
schema live; the lib-vs-entrypoints boundary rule and the
browser-specifics ladder; the TDD expectation; commands (dev, test,
e2e, zip, refresh-schema); the API gotchas above; Firefox-first,
cross-browser-reuse priority; token-vs-password auth design and the
never-persist-password rule.
