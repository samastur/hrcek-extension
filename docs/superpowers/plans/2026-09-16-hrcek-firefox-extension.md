# Hrček Firefox Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Firefox-first WXT browser extension that saves the current page to a Hrček server, with an edit-before-save popup, an options page for server/auth configuration, and a full unit/e2e/contract test suite — starting from an empty repository.

**Architecture:** All reusable logic lives in `src/lib/` (typed API client, auth strategies, settings, save flow) and never imports from `src/entrypoints/`; entrypoints (popup, options, background) are thin DOM wiring. Types are generated from Hrček's committed OpenAPI schema; an in-repo fake Hrček server backs e2e and contract tests, with an opt-in run against a real local Hrček.

**Tech Stack:** WXT (Vite), TypeScript strict, pnpm, Vitest (+ WXT fakeBrowser, msw, jsdom), Playwright (Chromium e2e), openapi-typescript, ESLint flat config + Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-hrcek-extension-design.md`

## Global Constraints

- TypeScript `strict: true`; TDD — every behavior change starts with a failing test.
- `src/lib/` never imports from `src/entrypoints/`; browser APIs only via WXT's `browser` / `#imports`.
- Branch on API error `code`, never on `message` (messages are translated and unstable).
- Secrets: token only in `browser.storage.local`; the password is NEVER persisted anywhere.
- Firefox is the primary target: `wxt -b firefox` (MV2). Chrome MV3 builds from the same source.
- Package manager is pnpm. Production zips must contain no test code (WXT bundles only entrypoints — keep it that way).
- The server URL is user-configured; the manifest must not require host permissions (optional `<all_urls>`, requested at runtime for the configured origin only). Exception: `--mode e2e` builds add `http://localhost/*` host permissions for automated tests.
- API semantics to respect everywhere: `POST /api/entries/` is an upsert (201 created / 200 updated); omitted attributes are CLEARED except `fields`, which is PATCHED (send `""` to clear one); field names match case-insensitively and come back in the owner's spelling; never hard-code field names.

---

### Task 1: Project scaffold (WXT + TypeScript + lint + empty test run)

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.gitignore`
- Create: `src/entrypoints/background.ts`
- Create: `src/entrypoints/popup/index.html`
- Create: `src/entrypoints/popup/main.ts`
- Create: `src/entrypoints/popup/style.css`
- Create: `src/entrypoints/options/index.html`
- Create: `src/entrypoints/options/main.ts`

**Interfaces:**
- Consumes: nothing (empty repo; only `docs/` exists).
- Produces: a building WXT project. Commands later tasks rely on: `pnpm build`, `pnpm build:e2e`, `pnpm test`, `pnpm typecheck`, `pnpm lint`. Entrypoint HTML files build to `popup.html` and `options.html` in `.output/<target>/`.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "hrcek-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Browser extension client for the Hrček link-saving service",
  "scripts": {
    "dev": "wxt -b firefox",
    "dev:chrome": "wxt -b chrome",
    "build": "wxt build -b firefox",
    "build:chrome": "wxt build -b chrome",
    "build:e2e": "wxt build -b chrome --mode e2e",
    "zip": "wxt zip -b firefox",
    "typecheck": "wxt prepare && tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "test:e2e": "pnpm build:e2e && playwright test",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write .",
    "refresh-schema": "sh scripts/refresh-schema.sh",
    "postinstall": "wxt prepare"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add -D wxt typescript vitest jsdom msw openapi-typescript tsx @playwright/test eslint @eslint/js typescript-eslint prettier
```

(WXT is a devDependency by convention; it bundles everything the extension ships.)

- [ ] **Step 3: Create wxt.config.ts**

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: ({ browser, manifestVersion, mode }) => ({
    name: 'Hrček',
    description: 'Save links to your Hrček',
    permissions: [
      'activeTab',
      'storage',
      'cookies',
      // e2e builds talk to the fake server without the optional-permission
      // dance (Playwright cannot click native permission prompts).
      ...(mode === 'e2e' ? ['http://localhost/*', 'http://127.0.0.1/*'] : []),
    ],
    // The server URL is user-configured, so its origin is requested at
    // runtime (options page). The manifest only declares it requestable.
    ...(manifestVersion === 2
      ? { optional_permissions: ['<all_urls>'] }
      : { optional_host_permissions: ['<all_urls>'] }),
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            // Placeholder AMO id — revisit before first AMO submission.
            gecko: { id: 'hrcek@samastur.com' },
          },
        }
      : {}),
  }),
});
```

Note: in MV3, host permission strings belong in `host_permissions`, but WXT accepts them in `permissions` and sorts them into the right manifest key per version. After building, verify placement (Step 10) — if `.output/chrome-mv3/manifest.json` does NOT show them under `host_permissions`, move the e2e origins into a literal `host_permissions` key for MV3 and `permissions` for MV2 in the same conditional style.

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true
  },
  "include": [".wxt/wxt.d.ts", "src", "tests", "*.ts"]
}
```

(`.wxt/tsconfig.json` is generated by `wxt prepare`; the postinstall hook runs it.)

- [ ] **Step 5: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
  },
});
```

- [ ] **Step 6: Create eslint.config.js and .prettierrc**

```js
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'node_modules/**',
      'src/lib/api/types.gen.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
```

```json
{
  "singleQuote": true,
  "printWidth": 90
}
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
.output/
.wxt/
stats.html
test-results/
playwright-report/
.DS_Store
```

- [ ] **Step 8: Create placeholder entrypoints**

```ts
// src/entrypoints/background.ts
export default defineBackground(() => {
  // Intentionally empty for now. Future home of the offline sync queue.
});
```

```html
<!-- src/entrypoints/popup/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hrček</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

```ts
// src/entrypoints/popup/main.ts
import './style.css';

document.querySelector('#app')!.textContent = 'Hrček';
```

```css
/* src/entrypoints/popup/style.css */
body {
  min-width: 22rem;
  margin: 0;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
}
```

```html
<!-- src/entrypoints/options/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hrček settings</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

```ts
// src/entrypoints/options/main.ts
document.querySelector('#app')!.textContent = 'Hrček settings';
```

- [ ] **Step 9: Verify test and lint commands pass on the empty project**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: all succeed (vitest passes with no tests via `--passWithNoTests`).
If prettier fails on generated/doc files, that is real feedback — run `pnpm format` once and re-check.

- [ ] **Step 10: Verify both browser builds**

Run: `pnpm build && pnpm build:e2e`
Expected: `.output/firefox-mv2/manifest.json` exists with `manifest_version: 2`, `browser_specific_settings.gecko.id`, and `optional_permissions` including `<all_urls>`; `.output/chrome-mv3/manifest.json` exists with `manifest_version: 3` and the localhost origins present (under `host_permissions` — see Step 3 note if not).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold WXT project with TypeScript, Vitest, ESLint"
```

---

### Task 2: Vendor the OpenAPI schema and generate API types

**Files:**
- Create: `scripts/refresh-schema.sh`
- Create: `docs/api/openapi.json` (copied)
- Create: `src/lib/api/types.gen.ts` (generated)
- Create: `src/lib/api/types.ts`

**Interfaces:**
- Consumes: `../hrcek/docs/api/openapi.json` (the Hrček repo checked out as a sibling directory).
- Produces: `src/lib/api/types.ts` exporting `EntryIn`, `EntryOut`, `UserOut`, `HealthOut`, `LoginIn` type aliases. Shapes (from the schema): `EntryOut = { id: number; url: string; title: string; notes: string; tags: string[]; fields: Record<string, string>; created_at: string; updated_at: string }`, `EntryIn = { url: string; title?: string; notes?: string; tags?: string[]; fields?: Record<string, unknown> | null }`, `UserOut = { email: string; display_name: string | null }`, `HealthOut = { status: string; service: string; version: string; message: string }`.

- [ ] **Step 1: Create the refresh script**

```sh
#!/bin/sh
# Copies the Hrček OpenAPI schema into this repo and regenerates TS types.
# The schema is vendored so CI does not need the hrcek checkout.
set -eu
SRC="${1:-../hrcek/docs/api/openapi.json}"
mkdir -p docs/api
cp "$SRC" docs/api/openapi.json
pnpm exec openapi-typescript docs/api/openapi.json -o src/lib/api/types.gen.ts
pnpm exec prettier --write docs/api/openapi.json src/lib/api/types.gen.ts
```

- [ ] **Step 2: Run it**

Run: `pnpm refresh-schema`
Expected: `docs/api/openapi.json` and `src/lib/api/types.gen.ts` created. Open `types.gen.ts` and confirm it exports `components` with `schemas: { EntryIn, EntryOut, UserOut, HealthOut, LoginIn, ... }` (if the generator emitted different names, adjust the aliases in Step 3 to match reality).

- [ ] **Step 3: Create the friendly aliases**

```ts
// src/lib/api/types.ts
import type { components } from './types.gen';

export type EntryIn = components['schemas']['EntryIn'];
export type EntryOut = components['schemas']['EntryOut'];
export type UserOut = components['schemas']['UserOut'];
export type HealthOut = components['schemas']['HealthOut'];
export type LoginIn = components['schemas']['LoginIn'];
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-schema.sh docs/api/openapi.json src/lib/api/types.gen.ts src/lib/api/types.ts
git commit -m "feat: vendor Hrček OpenAPI schema and generate API types"
```

---

### Task 3: API error model and HrcekClient

**Files:**
- Create: `src/lib/api/errors.ts`
- Create: `src/lib/api/errors.test.ts`
- Create: `src/lib/api/auth.ts`
- Create: `src/lib/api/auth.test.ts`
- Create: `src/lib/api/client.ts`
- Create: `src/lib/api/client.test.ts`

**Interfaces:**
- Consumes: types from Task 2 (`src/lib/api/types.ts`).
- Produces:
  - `class HrcekApiError extends Error { status: number; code: string; details: Record<string, unknown> }`
  - `class HrcekNetworkError extends Error`
  - `interface AuthStrategy { headers(method: string): Promise<Record<string, string>>; readonly credentials: RequestCredentials }`
  - `class TokenAuth implements AuthStrategy` (constructor: `token: string`)
  - `class SessionAuth implements AuthStrategy` (constructor: `getCsrfToken: () => Promise<string | null>`)
  - `type SaveResult = { status: 'created' | 'updated'; entry: EntryOut }`
  - `class HrcekClient` (constructor: `baseUrl: string, auth: AuthStrategy, fetchFn?: typeof fetch`) with `health(): Promise<HealthOut>`, `me(): Promise<UserOut>`, `login(identifier: string, password: string): Promise<UserOut>`, `getEntryByUrl(url: string): Promise<EntryOut>`, `saveEntry(entry: EntryIn): Promise<SaveResult>`.

- [ ] **Step 1: Write failing tests for the error model**

```ts
// src/lib/api/errors.test.ts
import { describe, expect, it } from 'vitest';
import { errorFromResponse, HrcekApiError } from './errors';

describe('errorFromResponse', () => {
  it('parses the Hrček error envelope', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: 'HRC-AUTH-0003',
          message: 'You must sign in to do that.',
          details: {},
        },
      }),
      { status: 401 },
    );

    const error = await errorFromResponse(response);

    expect(error).toBeInstanceOf(HrcekApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('HRC-AUTH-0003');
    expect(error.message).toBe('You must sign in to do that.');
    expect(error.details).toEqual({});
  });

  it('keeps machine-readable details', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: 'HRC-FIELD-0001',
          message: 'There is no field with that name.',
          details: { field: 'colour' },
        },
      }),
      { status: 422 },
    );

    const error = await errorFromResponse(response);

    expect(error.details).toEqual({ field: 'colour' });
  });

  it('survives a non-JSON body (proxy error page)', async () => {
    const response = new Response('<html>502 Bad Gateway</html>', { status: 502 });

    const error = await errorFromResponse(response);

    expect(error.status).toBe(502);
    expect(error.code).toBe('HRC-CLIENT-UNPARSEABLE');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/api/errors.test.ts`
Expected: FAIL — cannot resolve `./errors`.

- [ ] **Step 3: Implement errors.ts**

```ts
// src/lib/api/errors.ts

/** The stable Hrček error envelope: {"error": {"code", "message", "details"}}. */
interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}

/** A failure the server reported. Branch on `code`, never on `message`. */
export class HrcekApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HrcekApiError';
  }
}

/** The server could not be reached at all. */
export class HrcekNetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HrcekNetworkError';
  }
}

export async function errorFromResponse(response: Response): Promise<HrcekApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new HrcekApiError(
      response.status,
      body.error.code,
      body.error.message,
      body.error.details ?? {},
    );
  } catch {
    // Not the envelope — e.g. a reverse proxy's HTML error page.
    return new HrcekApiError(
      response.status,
      'HRC-CLIENT-UNPARSEABLE',
      `The server answered ${response.status} with an unreadable body.`,
    );
  }
}
```

- [ ] **Step 4: Run tests, expect pass; commit**

Run: `pnpm vitest run src/lib/api/errors.test.ts`
Expected: PASS.

```bash
git add src/lib/api/errors.ts src/lib/api/errors.test.ts
git commit -m "feat: Hrček API error envelope parsing"
```

- [ ] **Step 5: Write failing tests for auth strategies**

```ts
// src/lib/api/auth.test.ts
import { describe, expect, it, vi } from 'vitest';
import { SessionAuth, TokenAuth } from './auth';

describe('TokenAuth', () => {
  it('sends the bearer token on every method and no cookies', async () => {
    const auth = new TokenAuth('hrcek_abc');

    expect(await auth.headers('GET')).toEqual({ Authorization: 'Bearer hrcek_abc' });
    expect(await auth.headers('POST')).toEqual({ Authorization: 'Bearer hrcek_abc' });
    expect(auth.credentials).toBe('omit');
  });
});

describe('SessionAuth', () => {
  it('includes cookies and sends no extra headers on safe methods', async () => {
    const getCsrfToken = vi.fn();
    const auth = new SessionAuth(getCsrfToken);

    expect(await auth.headers('GET')).toEqual({});
    expect(getCsrfToken).not.toHaveBeenCalled();
    expect(auth.credentials).toBe('include');
  });

  it('sends X-CSRFToken on unsafe methods', async () => {
    const auth = new SessionAuth(async () => 'csrf-123');

    expect(await auth.headers('POST')).toEqual({ 'X-CSRFToken': 'csrf-123' });
  });

  it('omits the header when no CSRF token is available', async () => {
    const auth = new SessionAuth(async () => null);

    expect(await auth.headers('POST')).toEqual({});
  });
});
```

- [ ] **Step 6: Run to verify failure, then implement auth.ts**

Run: `pnpm vitest run src/lib/api/auth.test.ts` — expect FAIL (module missing).

```ts
// src/lib/api/auth.ts

/** How requests authenticate. The client is agnostic of the mode. */
export interface AuthStrategy {
  headers(method: string): Promise<Record<string, string>>;
  readonly credentials: RequestCredentials;
}

export class TokenAuth implements AuthStrategy {
  readonly credentials = 'omit';

  constructor(private readonly token: string) {}

  async headers(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${this.token}` };
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Session-cookie auth. Unsafe requests need Django's CSRF token; where it
 * comes from (browser.cookies) is injected so this stays browser-free.
 */
export class SessionAuth implements AuthStrategy {
  readonly credentials = 'include';

  constructor(private readonly getCsrfToken: () => Promise<string | null>) {}

  async headers(method: string): Promise<Record<string, string>> {
    if (!UNSAFE_METHODS.has(method.toUpperCase())) return {};
    const token = await this.getCsrfToken();
    return token === null ? {} : { 'X-CSRFToken': token };
  }
}
```

- [ ] **Step 7: Run tests, expect pass; commit**

Run: `pnpm vitest run src/lib/api/auth.test.ts`
Expected: PASS.

```bash
git add src/lib/api/auth.ts src/lib/api/auth.test.ts
git commit -m "feat: token and session auth strategies"
```

- [ ] **Step 8: Write failing client tests (msw)**

```ts
// src/lib/api/client.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { TokenAuth } from './auth';
import { HrcekClient } from './client';
import { HrcekApiError, HrcekNetworkError } from './errors';
import type { EntryOut } from './types';

const BASE = 'https://hrcek.test';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client() {
  return new HrcekClient(BASE, new TokenAuth('hrcek_abc'));
}

const ENTRY: EntryOut = {
  id: 1,
  url: 'https://example.com/watch',
  title: 'A watch',
  notes: '',
  tags: [],
  fields: {},
  created_at: '2026-09-13T12:28:12.937Z',
  updated_at: '2026-09-13T12:28:12.937Z',
};

describe('HrcekClient', () => {
  it('me() sends the bearer token and parses the user', async () => {
    server.use(
      http.get(`${BASE}/api/auth/me`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer hrcek_abc');
        return HttpResponse.json({ email: 'nina@example.com', display_name: null });
      }),
    );

    expect(await client().me()).toEqual({ email: 'nina@example.com', display_name: null });
  });

  it('saveEntry() distinguishes created from updated by status code', async () => {
    server.use(
      http.post(`${BASE}/api/entries/`, () => HttpResponse.json(ENTRY, { status: 201 })),
    );
    expect(await client().saveEntry({ url: ENTRY.url })).toEqual({
      status: 'created',
      entry: ENTRY,
    });

    server.use(
      http.post(`${BASE}/api/entries/`, () => HttpResponse.json(ENTRY, { status: 200 })),
    );
    expect(await client().saveEntry({ url: ENTRY.url })).toEqual({
      status: 'updated',
      entry: ENTRY,
    });
  });

  it('getEntryByUrl() url-encodes the address as a query parameter', async () => {
    server.use(
      http.get(`${BASE}/api/entries/by-url/`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('url')).toBe('https://example.com/a?b=c&d=e');
        return HttpResponse.json(ENTRY);
      }),
    );

    expect(await client().getEntryByUrl('https://example.com/a?b=c&d=e')).toEqual(ENTRY);
  });

  it('throws HrcekApiError with the server code on failure', async () => {
    server.use(
      http.get(`${BASE}/api/entries/by-url/`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'HRC-CORE-0003',
              message: 'The requested resource does not exist.',
              details: { url: 'https://example.com/nothing' },
            },
          },
          { status: 404 },
        ),
      ),
    );

    const error = await client()
      .getEntryByUrl('https://example.com/nothing')
      .then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(HrcekApiError);
    expect((error as HrcekApiError).code).toBe('HRC-CORE-0003');
    expect((error as HrcekApiError).status).toBe(404);
  });

  it('wraps connection failures in HrcekNetworkError', async () => {
    server.use(http.get(`${BASE}/api/health`, () => HttpResponse.error()));

    const error = await client()
      .health()
      .then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(HrcekNetworkError);
  });

  it('login() posts identifier and password', async () => {
    server.use(
      http.post(`${BASE}/api/auth/login`, async ({ request }) => {
        expect(await request.json()).toEqual({
          identifier: 'nina@example.com',
          password: 's3cret',
        });
        return HttpResponse.json({ email: 'nina@example.com', display_name: null });
      }),
    );

    expect(await client().login('nina@example.com', 's3cret')).toEqual({
      email: 'nina@example.com',
      display_name: null,
    });
  });
});
```

- [ ] **Step 9: Run to verify failure, then implement client.ts**

Run: `pnpm vitest run src/lib/api/client.test.ts` — expect FAIL (module missing).

```ts
// src/lib/api/client.ts
import type { AuthStrategy } from './auth';
import { errorFromResponse, HrcekNetworkError } from './errors';
import type { EntryIn, EntryOut, HealthOut, UserOut } from './types';

export type SaveResult = { status: 'created' | 'updated'; entry: EntryOut };

/** Thin typed wrapper over the Hrček HTTP API. */
export class HrcekClient {
  constructor(
    /** e.g. "https://hrcek.example.com" — no trailing slash. */
    private readonly baseUrl: string,
    private readonly auth: AuthStrategy,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  async health(): Promise<HealthOut> {
    return (await this.request('GET', '/api/health')).json();
  }

  async me(): Promise<UserOut> {
    return (await this.request('GET', '/api/auth/me')).json();
  }

  async login(identifier: string, password: string): Promise<UserOut> {
    const response = await this.request('POST', '/api/auth/login', {
      identifier,
      password,
    });
    return response.json();
  }

  async getEntryByUrl(url: string): Promise<EntryOut> {
    const query = new URLSearchParams({ url });
    return (await this.request('GET', `/api/entries/by-url/?${query}`)).json();
  }

  /** Upsert. 201 → created, 200 → updated (replace-except-fields semantics). */
  async saveEntry(entry: EntryIn): Promise<SaveResult> {
    const response = await this.request('POST', '/api/entries/', entry);
    return {
      status: response.status === 201 ? 'created' : 'updated',
      entry: await response.json(),
    };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(await this.auth.headers(method)),
    };
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        credentials: this.auth.credentials,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new HrcekNetworkError(`Could not reach ${this.baseUrl}.`, { cause });
    }
    if (!response.ok) throw await errorFromResponse(response);
    return response;
  }
}
```

- [ ] **Step 10: Run all tests, expect pass; commit**

Run: `pnpm test`
Expected: PASS (errors, auth, client suites).

```bash
git add src/lib/api/client.ts src/lib/api/client.test.ts
git commit -m "feat: typed HrcekClient over fetch"
```

---

### Task 4: Settings module and client factory

**Files:**
- Create: `src/lib/settings.ts`
- Create: `src/lib/settings.test.ts`
- Create: `src/lib/platform/cookies.ts`
- Create: `src/lib/client-factory.ts`
- Create: `src/lib/client-factory.test.ts`

**Interfaces:**
- Consumes: `HrcekClient`, `TokenAuth`, `SessionAuth` from Task 3.
- Produces:
  - `type AuthMode = 'token' | 'session'`
  - `interface Settings { serverUrl: string; authMode: AuthMode; token: string | null }`
  - `normalizeServerUrl(raw: string): string` (trims, strips trailing slashes)
  - `loadSettings(): Promise<Settings | null>`, `saveSettings(settings: Settings): Promise<void>`
  - `clientFromSettings(settings: Settings): HrcekClient`
  - `csrfTokenGetter(serverUrl: string): () => Promise<string | null>` (platform module; reads the `csrftoken` cookie, fetching `${serverUrl}/` once if absent)

- [ ] **Step 1: Write failing settings tests**

```ts
// src/lib/settings.test.ts
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
```

- [ ] **Step 2: Run to verify failure, then implement settings.ts**

Run: `pnpm vitest run src/lib/settings.test.ts` — expect FAIL.

```ts
// src/lib/settings.ts
import { storage } from '#imports';

export type AuthMode = 'token' | 'session';

export interface Settings {
  /** Base address of the Hrček server, no trailing slash. */
  serverUrl: string;
  authMode: AuthMode;
  /** Bearer token; only in token mode. The password is never stored. */
  token: string | null;
}

// storage.local only: storage.sync is unencrypted and replicated.
const settingsItem = storage.defineItem<Settings | null>('local:settings', {
  fallback: null,
});

export function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export async function loadSettings(): Promise<Settings | null> {
  return settingsItem.getValue();
}

export async function saveSettings(settings: Settings): Promise<void> {
  await settingsItem.setValue({
    ...settings,
    serverUrl: normalizeServerUrl(settings.serverUrl),
  });
}
```

- [ ] **Step 3: Run settings tests, expect pass; commit**

Run: `pnpm vitest run src/lib/settings.test.ts`
Expected: PASS.

```bash
git add src/lib/settings.ts src/lib/settings.test.ts
git commit -m "feat: settings storage with URL normalization"
```

- [ ] **Step 4: Write failing client-factory tests**

```ts
// src/lib/client-factory.test.ts
import { describe, expect, it } from 'vitest';
import { authForSettings } from './client-factory';
import { SessionAuth, TokenAuth } from './api/auth';

describe('authForSettings', () => {
  it('uses bearer auth in token mode', () => {
    const auth = authForSettings({
      serverUrl: 'https://h.example',
      authMode: 'token',
      token: 'hrcek_abc',
    });

    expect(auth).toBeInstanceOf(TokenAuth);
  });

  it('uses session auth in session mode', () => {
    const auth = authForSettings({
      serverUrl: 'https://h.example',
      authMode: 'session',
      token: null,
    });

    expect(auth).toBeInstanceOf(SessionAuth);
  });
});
```

- [ ] **Step 5: Run to verify failure, then implement cookies.ts and client-factory.ts**

Run: `pnpm vitest run src/lib/client-factory.test.ts` — expect FAIL.

```ts
// src/lib/platform/cookies.ts
import { browser } from 'wxt/browser';

/**
 * Platform module (browser-specifics ladder, rung 3). Identical everywhere
 * today; split into per-browser files here if Safari's cookie handling
 * ever diverges.
 */
export async function getCookie(
  serverUrl: string,
  name: string,
): Promise<string | null> {
  const cookie = await browser.cookies.get({ url: serverUrl, name });
  return cookie?.value ?? null;
}

/** Django only sets csrftoken when a page asks for it, so fetch one if missing. */
export function csrfTokenGetter(serverUrl: string): () => Promise<string | null> {
  return async () => {
    const token = await getCookie(serverUrl, 'csrftoken');
    if (token !== null) return token;
    await fetch(`${serverUrl}/`, { credentials: 'include' });
    return getCookie(serverUrl, 'csrftoken');
  };
}
```

```ts
// src/lib/client-factory.ts
import { SessionAuth, TokenAuth, type AuthStrategy } from './api/auth';
import { HrcekClient } from './api/client';
import { csrfTokenGetter } from './platform/cookies';
import type { Settings } from './settings';

export function authForSettings(settings: Settings): AuthStrategy {
  return settings.authMode === 'token'
    ? new TokenAuth(settings.token ?? '')
    : new SessionAuth(csrfTokenGetter(settings.serverUrl));
}

export function clientFromSettings(settings: Settings): HrcekClient {
  return new HrcekClient(settings.serverUrl, authForSettings(settings));
}
```

- [ ] **Step 6: Run all tests, expect pass; commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

```bash
git add src/lib/platform/cookies.ts src/lib/client-factory.ts src/lib/client-factory.test.ts
git commit -m "feat: client factory with per-mode auth and cookie platform module"
```

---

### Task 5: Save flow (look-before-write, single submit boundary)

**Files:**
- Create: `src/lib/save.ts`
- Create: `src/lib/save.test.ts`

**Interfaces:**
- Consumes: `HrcekClient`, `SaveResult` (Task 3); `HrcekApiError` (Task 3); `EntryOut` (Task 2).
- Produces:
  - `interface SaveRequest { url: string; title: string; notes: string; tags: string[]; fields: Record<string, string> }`
  - `loadExisting(client: HrcekClient, url: string): Promise<EntryOut | null>` — 404/`HRC-CORE-0003` → `null`, everything else rethrows.
  - `submitSave(client: HrcekClient, request: SaveRequest): Promise<SaveResult>` — THE submit boundary; the future offline queue wraps/replaces this function only.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/save.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { HrcekClient } from './api/client';
import { HrcekApiError } from './api/errors';
import { loadExisting, submitSave } from './save';
import type { EntryOut } from './api/types';

const ENTRY: EntryOut = {
  id: 1,
  url: 'https://example.com/watch',
  title: 'A watch',
  notes: '',
  tags: [],
  fields: { Price: '129' },
  created_at: '2026-09-13T12:28:12.937Z',
  updated_at: '2026-09-13T12:28:12.937Z',
};

describe('loadExisting', () => {
  it('returns the entry when the address is already held', async () => {
    const client = {
      getEntryByUrl: vi.fn().mockResolvedValue(ENTRY),
    } as unknown as HrcekClient;

    expect(await loadExisting(client, ENTRY.url)).toEqual(ENTRY);
  });

  it('returns null on HRC-CORE-0003 (not held)', async () => {
    const client = {
      getEntryByUrl: vi
        .fn()
        .mockRejectedValue(new HrcekApiError(404, 'HRC-CORE-0003', 'not there')),
    } as unknown as HrcekClient;

    expect(await loadExisting(client, 'https://example.com/nothing')).toBeNull();
  });

  it('rethrows any other failure', async () => {
    const client = {
      getEntryByUrl: vi
        .fn()
        .mockRejectedValue(new HrcekApiError(401, 'HRC-AUTH-0003', 'sign in')),
    } as unknown as HrcekClient;

    await expect(loadExisting(client, ENTRY.url)).rejects.toMatchObject({
      code: 'HRC-AUTH-0003',
    });
  });
});

describe('submitSave', () => {
  it('posts the whole entry through the client', async () => {
    const saveEntry = vi.fn().mockResolvedValue({ status: 'created', entry: ENTRY });
    const client = { saveEntry } as unknown as HrcekClient;

    const outcome = await submitSave(client, {
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['watches'],
      fields: { price: '129.00' },
    });

    expect(saveEntry).toHaveBeenCalledWith({
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['watches'],
      fields: { price: '129.00' },
    });
    expect(outcome).toEqual({ status: 'created', entry: ENTRY });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/save.test.ts`
Expected: FAIL — cannot resolve `./save`.

- [ ] **Step 3: Implement save.ts**

```ts
// src/lib/save.ts
import type { HrcekClient, SaveResult } from './api/client';
import { HrcekApiError } from './api/errors';
import type { EntryOut } from './api/types';

export interface SaveRequest {
  url: string;
  title: string;
  notes: string;
  tags: string[];
  fields: Record<string, string>;
}

/** Look before writing: POST replaces, so the UI must show what it replaces. */
export async function loadExisting(
  client: HrcekClient,
  url: string,
): Promise<EntryOut | null> {
  try {
    return await client.getEntryByUrl(url);
  } catch (error) {
    if (error instanceof HrcekApiError && error.code === 'HRC-CORE-0003') return null;
    throw error;
  }
}

/**
 * The single submit boundary. A future offline queue slots in here:
 * persist the request when the server is unreachable instead of throwing.
 */
export async function submitSave(
  client: HrcekClient,
  request: SaveRequest,
): Promise<SaveResult> {
  return client.saveEntry({
    url: request.url,
    title: request.title,
    notes: request.notes,
    tags: request.tags,
    fields: request.fields,
  });
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/save.ts src/lib/save.test.ts
git commit -m "feat: look-before-write save flow with queue-ready submit boundary"
```

---

### Task 6: Popup form model and UI

**Files:**
- Create: `src/entrypoints/popup/form.ts`
- Create: `src/entrypoints/popup/form.test.ts`
- Modify: `src/entrypoints/popup/main.ts` (replace placeholder)
- Modify: `src/entrypoints/popup/style.css` (replace placeholder)

**Interfaces:**
- Consumes: `loadSettings` (Task 4), `clientFromSettings` (Task 4), `loadExisting`/`submitSave`/`SaveRequest` (Task 5), `HrcekApiError`/`HrcekNetworkError` (Task 3), `EntryOut` (Task 2).
- Produces (used by e2e tests in Task 9):
  - `interface FormState { url: string; title: string; notes: string; tags: string; fields: Array<{ name: string; value: string }> }`
  - `parseTags(input: string): string[]`, `emptyForm(url: string, title: string): FormState`, `entryToForm(entry: EntryOut): FormState`, `formToSaveRequest(form: FormState): SaveRequest`
  - Popup DOM contract: inputs `#url`, `#title`, `#notes`, `#tags`; field rows under `#fields` with `input.field-name` and `input.field-value`; buttons `#add-field`, `#save`, `#open-options`; status paragraph `#status` with `data-kind="info|success|error"`; heading `#existing-note` shown when the address is already held. Testability seam: `popup.html?url=...&title=...` overrides the active-tab lookup.

- [ ] **Step 1: Write failing form-model tests**

```ts
// src/entrypoints/popup/form.test.ts
import { describe, expect, it } from 'vitest';
import { emptyForm, entryToForm, formToSaveRequest, parseTags } from './form';
import type { EntryOut } from '../../lib/api/types';

describe('parseTags', () => {
  it('splits on commas, trims, and drops empties', () => {
    expect(parseTags(' watches, diving ,,  ')).toEqual(['watches', 'diving']);
    expect(parseTags('')).toEqual([]);
  });
});

describe('entryToForm', () => {
  it('maps an existing entry into editable form state', () => {
    const entry: EntryOut = {
      id: 1,
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['diving', 'watches'],
      fields: { Price: '129', Priority: 'high' },
      created_at: '2026-09-13T12:28:12.937Z',
      updated_at: '2026-09-13T12:28:12.937Z',
    };

    expect(entryToForm(entry)).toEqual({
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: 'diving, watches',
      fields: [
        { name: 'Price', value: '129' },
        { name: 'Priority', value: 'high' },
      ],
    });
  });
});

describe('formToSaveRequest', () => {
  it('collects the form into a SaveRequest', () => {
    const request = formToSaveRequest({
      url: ' https://example.com/watch ',
      title: ' A watch ',
      notes: '38mm',
      tags: 'watches, diving',
      fields: [
        { name: ' price ', value: '129.00' },
        { name: '', value: 'ignored — no name' },
      ],
    });

    expect(request).toEqual({
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['watches', 'diving'],
      fields: { price: '129.00' },
    });
  });

  it('keeps an emptied value so the server clears that field', () => {
    const request = formToSaveRequest({
      ...emptyForm('https://example.com/watch', ''),
      fields: [{ name: 'Price', value: '' }],
    });

    expect(request.fields).toEqual({ Price: '' });
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement form.ts**

Run: `pnpm vitest run src/entrypoints/popup/form.test.ts` — expect FAIL.

```ts
// src/entrypoints/popup/form.ts
import type { EntryOut } from '../../lib/api/types';
import type { SaveRequest } from '../../lib/save';

export interface FormState {
  url: string;
  title: string;
  notes: string;
  /** Comma-separated, as typed. */
  tags: string;
  fields: Array<{ name: string; value: string }>;
}

export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function emptyForm(url: string, title: string): FormState {
  return { url, title, notes: '', tags: '', fields: [] };
}

export function entryToForm(entry: EntryOut): FormState {
  return {
    url: entry.url,
    title: entry.title,
    notes: entry.notes,
    tags: entry.tags.join(', '),
    fields: Object.entries(entry.fields).map(([name, value]) => ({ name, value })),
  };
}

export function formToSaveRequest(form: FormState): SaveRequest {
  const fields: Record<string, string> = {};
  for (const { name, value } of form.fields) {
    const trimmed = name.trim();
    // An empty VALUE is kept: that is how the API clears a field.
    if (trimmed.length > 0) fields[trimmed] = value;
  }
  return {
    url: form.url.trim(),
    title: form.title.trim(),
    notes: form.notes,
    tags: parseTags(form.tags),
    fields,
  };
}
```

- [ ] **Step 3: Run form tests, expect pass; commit**

Run: `pnpm vitest run src/entrypoints/popup/form.test.ts`
Expected: PASS.

```bash
git add src/entrypoints/popup/form.ts src/entrypoints/popup/form.test.ts
git commit -m "feat: popup form model"
```

- [ ] **Step 4: Implement the popup UI (thin wiring — covered by e2e in Task 9)**

```ts
// src/entrypoints/popup/main.ts
import { browser } from 'wxt/browser';
import { HrcekApiError, HrcekNetworkError } from '../../lib/api/errors';
import { clientFromSettings } from '../../lib/client-factory';
import { loadExisting, submitSave } from '../../lib/save';
import { loadSettings } from '../../lib/settings';
import { emptyForm, entryToForm, formToSaveRequest, type FormState } from './form';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** e2e seam: ?url=&title= override the active-tab lookup. */
async function getPageInfo(): Promise<{ url: string; title: string }> {
  const params = new URLSearchParams(window.location.search);
  const urlOverride = params.get('url');
  if (urlOverride !== null) {
    return { url: urlOverride, title: params.get('title') ?? '' };
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return { url: tab?.url ?? '', title: tab?.title ?? '' };
}

function setStatus(kind: 'info' | 'success' | 'error', text: string): void {
  const status = document.querySelector<HTMLParagraphElement>('#status')!;
  status.dataset.kind = kind;
  status.textContent = text;
}

function messageFor(error: unknown): string {
  // The server's message is translated and made for people — show it.
  if (error instanceof HrcekApiError) return error.message;
  if (error instanceof HrcekNetworkError) return error.message;
  return 'Something went wrong.';
}

function fieldRow(name: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'field-row';
  row.innerHTML = `
    <input class="field-name" placeholder="Field" />
    <input class="field-value" placeholder="Value" />
  `;
  row.querySelector<HTMLInputElement>('.field-name')!.value = name;
  row.querySelector<HTMLInputElement>('.field-value')!.value = value;
  return row;
}

function renderUnconfigured(): void {
  app.innerHTML = `
    <p>Hrček is not configured yet.</p>
    <button id="open-options">Open settings</button>
  `;
  document
    .querySelector<HTMLButtonElement>('#open-options')!
    .addEventListener('click', () => browser.runtime.openOptionsPage());
}

function renderForm(form: FormState, existing: boolean): void {
  app.innerHTML = `
    <form id="entry-form">
      ${existing ? '<p id="existing-note">Already saved — editing the existing entry.</p>' : ''}
      <label>Address <input id="url" required /></label>
      <label>Title <input id="title" /></label>
      <label>Notes <textarea id="notes" rows="3"></textarea></label>
      <label>Tags <input id="tags" placeholder="comma, separated" /></label>
      <div id="fields"></div>
      <button type="button" id="add-field">Add field</button>
      <button type="submit" id="save">Save</button>
      <p id="status" data-kind="info"></p>
    </form>
  `;
  document.querySelector<HTMLInputElement>('#url')!.value = form.url;
  document.querySelector<HTMLInputElement>('#title')!.value = form.title;
  document.querySelector<HTMLTextAreaElement>('#notes')!.value = form.notes;
  document.querySelector<HTMLInputElement>('#tags')!.value = form.tags;
  const fieldsBox = document.querySelector<HTMLDivElement>('#fields')!;
  for (const { name, value } of form.fields) {
    fieldsBox.append(fieldRow(name, value));
  }

  document.querySelector<HTMLButtonElement>('#add-field')!.addEventListener(
    'click',
    () => fieldsBox.append(fieldRow('', '')),
  );

  document
    .querySelector<HTMLFormElement>('#entry-form')!
    .addEventListener('submit', (event) => {
      event.preventDefault();
      void save();
    });
}

function collectForm(): FormState {
  return {
    url: document.querySelector<HTMLInputElement>('#url')!.value,
    title: document.querySelector<HTMLInputElement>('#title')!.value,
    notes: document.querySelector<HTMLTextAreaElement>('#notes')!.value,
    tags: document.querySelector<HTMLInputElement>('#tags')!.value,
    fields: [...document.querySelectorAll<HTMLDivElement>('.field-row')].map((row) => ({
      name: row.querySelector<HTMLInputElement>('.field-name')!.value,
      value: row.querySelector<HTMLInputElement>('.field-value')!.value,
    })),
  };
}

async function save(): Promise<void> {
  const settings = (await loadSettings())!;
  const client = clientFromSettings(settings);
  setStatus('info', 'Saving…');
  try {
    const outcome = await submitSave(client, formToSaveRequest(collectForm()));
    setStatus('success', outcome.status === 'created' ? 'Saved.' : 'Updated.');
  } catch (error) {
    setStatus('error', messageFor(error));
  }
}

async function main(): Promise<void> {
  const settings = await loadSettings();
  if (settings === null) {
    renderUnconfigured();
    return;
  }
  const { url, title } = await getPageInfo();
  const client = clientFromSettings(settings);
  try {
    const existing = url.length > 0 ? await loadExisting(client, url) : null;
    if (existing !== null) {
      renderForm(entryToForm(existing), true);
    } else {
      renderForm(emptyForm(url, title), false);
    }
  } catch (error) {
    renderForm(emptyForm(url, title), false);
    setStatus('error', messageFor(error));
  }
}

void main();
```

```css
/* src/entrypoints/popup/style.css */
body {
  min-width: 22rem;
  margin: 0;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
}
#app {
  padding: 0.75rem;
}
label {
  display: block;
  margin-bottom: 0.5rem;
}
label input,
label textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.15rem;
}
.field-row {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
}
.field-row input {
  flex: 1;
  min-width: 0;
}
#status[data-kind='error'] {
  color: #b00020;
}
#status[data-kind='success'] {
  color: #1a7f37;
}
```

- [ ] **Step 5: Verify build, typecheck, lint**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all PASS. (Behavior is exercised by e2e tests in Task 9; the logic worth unit-testing lives in `form.ts` and `lib/`.)

- [ ] **Step 6: Commit**

```bash
git add src/entrypoints/popup/
git commit -m "feat: popup save UI with look-before-write prefill"
```

---

### Task 7: Options page

**Files:**
- Modify: `src/entrypoints/options/main.ts` (replace placeholder)
- Create: `src/entrypoints/options/style.css`
- Modify: `src/entrypoints/options/index.html` (link stylesheet via import in main.ts — no HTML change needed beyond what exists)

**Interfaces:**
- Consumes: `loadSettings`/`saveSettings`/`normalizeServerUrl` (Task 4), `clientFromSettings` (Task 4), `HrcekApiError`/`HrcekNetworkError` (Task 3).
- Produces (DOM contract used by e2e in Task 9): inputs `#server-url`, `#token`, `#identifier`, `#password`; radios `#mode-token`, `#mode-session` (name `mode`); buttons `#save`, `#test`; status paragraph `#status` with `data-kind`; link `#account-link` pointing at `${serverUrl}/accounts/me/`. Saving in session mode with a filled password logs in immediately and clears the password input; the password is never stored.

- [ ] **Step 1: Implement the options UI**

```ts
// src/entrypoints/options/main.ts
import { browser } from 'wxt/browser';
import { HrcekApiError, HrcekNetworkError } from '../../lib/api/errors';
import { clientFromSettings } from '../../lib/client-factory';
import {
  loadSettings,
  normalizeServerUrl,
  saveSettings,
  type AuthMode,
} from '../../lib/settings';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Hrček settings</h1>
  <form id="settings-form">
    <label>Server address
      <input id="server-url" type="url" placeholder="https://hrcek.example.com" required />
    </label>
    <fieldset>
      <legend>Sign in with</legend>
      <label><input type="radio" name="mode" id="mode-token" value="token" checked />
        API token (recommended)</label>
      <label><input type="radio" name="mode" id="mode-session" value="session" />
        Email/name and password</label>
    </fieldset>
    <div id="token-section">
      <label>API token
        <input id="token" type="password" placeholder="hrcek_…" autocomplete="off" />
      </label>
      <p>Create one on <a id="account-link" href="#" target="_blank">your account page</a>.</p>
    </div>
    <div id="session-section" hidden>
      <label>Email or display name <input id="identifier" autocomplete="username" /></label>
      <label>Password
        <input id="password" type="password" autocomplete="current-password" />
      </label>
      <p>The password is used once to sign in and never stored. You will be
         asked again when the session expires.</p>
    </div>
    <button type="submit" id="save">Save</button>
    <button type="button" id="test">Test connection</button>
    <p id="status" data-kind="info"></p>
  </form>
`;

const serverUrlInput = document.querySelector<HTMLInputElement>('#server-url')!;
const tokenInput = document.querySelector<HTMLInputElement>('#token')!;
const identifierInput = document.querySelector<HTMLInputElement>('#identifier')!;
const passwordInput = document.querySelector<HTMLInputElement>('#password')!;
const modeToken = document.querySelector<HTMLInputElement>('#mode-token')!;
const modeSession = document.querySelector<HTMLInputElement>('#mode-session')!;
const tokenSection = document.querySelector<HTMLDivElement>('#token-section')!;
const sessionSection = document.querySelector<HTMLDivElement>('#session-section')!;
const accountLink = document.querySelector<HTMLAnchorElement>('#account-link')!;

function setStatus(kind: 'info' | 'success' | 'error', text: string): void {
  const status = document.querySelector<HTMLParagraphElement>('#status')!;
  status.dataset.kind = kind;
  status.textContent = text;
}

function messageFor(error: unknown): string {
  if (error instanceof HrcekApiError) return error.message;
  if (error instanceof HrcekNetworkError) return error.message;
  return 'Something went wrong.';
}

function currentMode(): AuthMode {
  return modeSession.checked ? 'session' : 'token';
}

function syncSections(): void {
  tokenSection.hidden = currentMode() !== 'token';
  sessionSection.hidden = currentMode() !== 'session';
}
modeToken.addEventListener('change', syncSections);
modeSession.addEventListener('change', syncSections);

serverUrlInput.addEventListener('change', () => {
  accountLink.href = `${normalizeServerUrl(serverUrlInput.value)}/accounts/me/`;
});

/** The manifest holds no host permissions; ask for this server's origin. */
async function requestOriginPermission(serverUrl: string): Promise<boolean> {
  const origin = `${new URL(serverUrl).origin}/*`;
  try {
    return await browser.permissions.request({ origins: [origin] });
  } catch {
    // e.g. not called from a user gesture; the save itself will surface it.
    return false;
  }
}

document
  .querySelector<HTMLFormElement>('#settings-form')!
  .addEventListener('submit', (event) => {
    event.preventDefault();
    void save();
  });

async function save(): Promise<void> {
  const serverUrl = normalizeServerUrl(serverUrlInput.value);
  const mode = currentMode();
  setStatus('info', 'Saving…');

  const granted = await requestOriginPermission(serverUrl);

  const settings = {
    serverUrl,
    authMode: mode,
    token: mode === 'token' ? tokenInput.value.trim() : null,
  };
  await saveSettings(settings);

  if (mode === 'session' && passwordInput.value.length > 0) {
    try {
      const user = await clientFromSettings(settings).login(
        identifierInput.value.trim(),
        passwordInput.value,
      );
      passwordInput.value = ''; // used once, never kept
      setStatus('success', `Saved. Signed in as ${user.email}.`);
    } catch (error) {
      setStatus('error', messageFor(error));
    }
    return;
  }

  setStatus(
    'success',
    granted ? 'Saved.' : 'Saved. Grant site access when asked on first save.',
  );
}

document.querySelector<HTMLButtonElement>('#test')!.addEventListener('click', () => {
  void testConnection();
});

async function testConnection(): Promise<void> {
  const settings = await loadSettings();
  if (settings === null) {
    setStatus('error', 'Save the settings first.');
    return;
  }
  setStatus('info', 'Testing…');
  try {
    const user = await clientFromSettings(settings).me();
    setStatus('success', `Connected as ${user.email}.`);
  } catch (error) {
    setStatus('error', messageFor(error));
  }
}

async function restore(): Promise<void> {
  const settings = await loadSettings();
  if (settings === null) return;
  serverUrlInput.value = settings.serverUrl;
  accountLink.href = `${settings.serverUrl}/accounts/me/`;
  if (settings.authMode === 'session') {
    modeSession.checked = true;
  } else {
    tokenInput.value = settings.token ?? '';
  }
  syncSections();
}

void restore();
```

```css
/* src/entrypoints/options/style.css */
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  font-size: 0.9rem;
}
#app {
  max-width: 30rem;
  padding: 1rem;
}
label {
  display: block;
  margin-bottom: 0.6rem;
}
label input[type='url'],
label input[type='password'],
#identifier {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.15rem;
}
fieldset {
  margin: 0 0 0.75rem;
}
#status[data-kind='error'] {
  color: #b00020;
}
#status[data-kind='success'] {
  color: #1a7f37;
}
```

- [ ] **Step 2: Verify typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS. (Options behavior is exercised end-to-end in Task 9; its logic lives in already-tested `lib/` modules.)

- [ ] **Step 3: Manual smoke test in real Firefox**

Run: `pnpm dev`
Expected: Firefox opens with the extension loaded. Open the extension's options (about:addons → Hrček → Preferences): the form renders, switching auth mode toggles sections. This is a smoke check only; do not spend time here.

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/options/
git commit -m "feat: options page with token and session auth modes"
```

---

### Task 8: Fake Hrček server

**Files:**
- Create: `tests/fake-hrcek/server.ts`
- Create: `tests/fake-hrcek/server.test.ts`
- Create: `tests/fake-hrcek/main.ts`

**Interfaces:**
- Consumes: `EntryOut` type (Task 2) — the fake is typed against the generated schema so it cannot drift.
- Produces (used by e2e in Task 9 and contract tests in Task 10):
  - `const FAKE_TOKEN = 'hrcek_test_token'`, `const FAKE_IDENTIFIER = 'nina@example.com'`, `const FAKE_PASSWORD = 'correct horse'`, `const FAKE_USER = { email: 'nina@example.com', display_name: null }`
  - `startFakeHrcek(port?: number): Promise<FakeHrcek>` where `interface FakeHrcek { url: string; reset(): void; close(): Promise<void> }` (port 0 → ephemeral)
  - Endpoints: `GET /api/health`, `GET /api/auth/me`, `POST /api/auth/login` (sets `sessionid` + `csrftoken` cookies), `POST /api/entries/`, `GET /api/entries/by-url/`, plus test-only `POST /__reset`.
  - Account fields: `Price` (number) and `Priority` (`high|medium|low`), matching a fresh Hrček account.
  - `tests/fake-hrcek/main.ts` runs it on `PORT` (default 8787) for Playwright's webServer.

- [ ] **Step 1: Write failing behavior tests**

```ts
// tests/fake-hrcek/server.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FAKE_IDENTIFIER,
  FAKE_PASSWORD,
  FAKE_TOKEN,
  startFakeHrcek,
  type FakeHrcek,
} from './server';

let fake: FakeHrcek;

beforeAll(async () => {
  fake = await startFakeHrcek(0);
});
afterAll(async () => {
  await fake.close();
});
beforeEach(() => {
  fake.reset();
});

const AUTH = { Authorization: `Bearer ${FAKE_TOKEN}` };
const JSON_AUTH = { ...AUTH, 'Content-Type': 'application/json' };

async function post(body: unknown, headers: Record<string, string> = JSON_AUTH) {
  return fetch(`${fake.url}/api/entries/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('fake hrcek', () => {
  it('reports health without credentials', async () => {
    const response = await fetch(`${fake.url}/api/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('ok');
  });

  it('rejects missing credentials with HRC-AUTH-0003', async () => {
    const response = await fetch(`${fake.url}/api/auth/me`);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('HRC-AUTH-0003');
  });

  it('creates then updates an entry, replace-except-fields', async () => {
    const created = await post({
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['watches'],
      fields: { price: '129.00' },
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.fields).toEqual({ Price: '129' });

    const updated = await post({ url: 'https://example.com/watch', title: 'Again' });
    expect(updated.status).toBe(200);
    const updatedBody = await updated.json();
    expect(updatedBody.id).toBe(createdBody.id);
    expect(updatedBody.notes).toBe(''); // replaced
    expect(updatedBody.tags).toEqual([]); // replaced
    expect(updatedBody.fields).toEqual({ Price: '129' }); // patched, survives
  });

  it('clears a field only when named with an empty string', async () => {
    await post({ url: 'https://example.com/w', fields: { price: '10', priority: 'low' } });
    const response = await post({ url: 'https://example.com/w', fields: { price: '' } });
    expect((await response.json()).fields).toEqual({ Priority: 'low' });
  });

  it('matches addresses with trimmed whitespace and lowercased scheme/host', async () => {
    await post({ url: 'https://Example.COM/Watch' });
    const response = await post({ url: '  HTTPS://example.com/Watch  ' });
    expect(response.status).toBe(200); // same entry — updated, not created
  });

  it('answers 422 HRC-FIELD-0001 for an unknown field name', async () => {
    const response = await post({ url: 'https://example.com/x', fields: { colour: 'red' } });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('HRC-FIELD-0001');
    expect(body.error.details).toEqual({ field: 'colour' });
  });

  it('answers 422 HRC-CORE-0002 for a bad value, keyed by owner spelling', async () => {
    const response = await post({ url: 'https://example.com/x', fields: { priority: 'urgent' } });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('HRC-CORE-0002');
    expect(Object.keys(body.error.details.fields)).toEqual(['Priority']);
  });

  it('answers by-url with the held entry, 404 with HRC-CORE-0003 otherwise', async () => {
    await post({ url: 'https://example.com/held' });
    const held = await fetch(
      `${fake.url}/api/entries/by-url/?url=${encodeURIComponent('https://example.com/held')}`,
      { headers: AUTH },
    );
    expect(held.status).toBe(200);
    expect((await held.json()).url).toBe('https://example.com/held');

    const missing = await fetch(
      `${fake.url}/api/entries/by-url/?url=${encodeURIComponent('https://example.com/no')}`,
      { headers: AUTH },
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('HRC-CORE-0003');
  });

  it('logs in with cookies and enforces CSRF on session posts', async () => {
    const login = await fetch(`${fake.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: FAKE_IDENTIFIER, password: FAKE_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const cookies = login.headers.getSetCookie();
    expect(cookies.join(';')).toContain('sessionid=');
    expect(cookies.join(';')).toContain('csrftoken=');

    const sessionCookie = 'sessionid=fake-session; csrftoken=fake-csrf';
    const noCsrf = await post(
      { url: 'https://example.com/s' },
      { 'Content-Type': 'application/json', Cookie: sessionCookie },
    );
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.json()).error.code).toBe('HRC-AUTH-0005');

    const withCsrf = await post(
      { url: 'https://example.com/s' },
      {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'X-CSRFToken': 'fake-csrf',
      },
    );
    expect(withCsrf.status).toBe(201);
  });

  it('rejects a bad password with HRC-AUTH-0001', async () => {
    const login = await fetch(`${fake.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: FAKE_IDENTIFIER, password: 'wrong' }),
    });
    expect(login.status).toBe(401);
    expect((await login.json()).error.code).toBe('HRC-AUTH-0001');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/fake-hrcek/server.test.ts`
Expected: FAIL — cannot resolve `./server`.

- [ ] **Step 3: Implement the fake server**

```ts
// tests/fake-hrcek/server.ts
// A small in-memory Hrček good enough for e2e and contract tests.
// Behavior mirrors ../hrcek/docs/dev/api.md; responses are typed against
// the generated schema so the fake cannot quietly drift from it.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { EntryOut, HealthOut, UserOut } from '../../src/lib/api/types';

export const FAKE_TOKEN = 'hrcek_test_token';
export const FAKE_IDENTIFIER = 'nina@example.com';
export const FAKE_PASSWORD = 'correct horse';
export const FAKE_USER: UserOut = { email: 'nina@example.com', display_name: null };

const SESSION_ID = 'fake-session';
const CSRF_TOKEN = 'fake-csrf';

/** A fresh Hrček account's default fields. */
const ACCOUNT_FIELDS = [
  { name: 'Price', kind: 'number' as const },
  { name: 'Priority', kind: 'choice' as const, choices: ['high', 'medium', 'low'] },
];

export interface FakeHrcek {
  url: string;
  reset(): void;
  close(): Promise<void>;
}

interface ErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}

function errorBody(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): ErrorBody {
  return { error: { code, message, details } };
}

/** Whitespace trimmed, scheme and host lowercased — and nothing else. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/]*)(.*)$/.exec(trimmed);
  if (match === null) return trimmed;
  return `${match[1]!.toLowerCase()}://${match[2]!.toLowerCase()}${match[3]!}`;
}

function isValidUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** "129.00" -> "129", "38.50" -> "38.5" — the way it was most likely typed. */
function normalizeNumber(value: string): string {
  return String(Number(value));
}

export async function startFakeHrcek(port = 0): Promise<FakeHrcek> {
  let entries = new Map<string, EntryOut>();
  let nextId = 1;
  let clock = 0;

  function timestamp(): string {
    clock += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString();
  }

  function json(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  function parseCookies(req: http.IncomingMessage): Record<string, string> {
    const header = req.headers.cookie ?? '';
    const cookies: Record<string, string> = {};
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name) cookies[name] = rest.join('=');
    }
    return cookies;
  }

  /** Returns null when authenticated; an error response description otherwise. */
  function checkAuth(
    req: http.IncomingMessage,
  ): { status: number; body: ErrorBody } | null {
    const auth = req.headers.authorization ?? '';
    if (auth === `Bearer ${FAKE_TOKEN}`) return null;
    const cookies = parseCookies(req);
    if (cookies['sessionid'] === SESSION_ID) {
      const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET');
      if (unsafe && req.headers['x-csrftoken'] !== cookies['csrftoken']) {
        return {
          status: 403,
          body: errorBody('HRC-AUTH-0005', 'CSRF check failed.'),
        };
      }
      return null;
    }
    return {
      status: 401,
      body: errorBody('HRC-AUTH-0003', 'You must sign in to do that.'),
    };
  }

  function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => (data += chunk.toString()));
      req.on('end', () => {
        try {
          resolve(data.length > 0 ? JSON.parse(data) : {});
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  /** Returns the updated fields or an error. Implements patch semantics. */
  function applyFields(
    current: Record<string, string>,
    submitted: Record<string, unknown>,
  ): { fields: Record<string, string> } | { status: number; body: ErrorBody } {
    const result = { ...current };
    for (const [rawName, rawValue] of Object.entries(submitted)) {
      const definition = ACCOUNT_FIELDS.find(
        (field) => field.name.toLowerCase() === rawName.trim().toLowerCase(),
      );
      if (definition === undefined) {
        return {
          status: 422,
          body: errorBody('HRC-FIELD-0001', 'There is no field with that name.', {
            field: rawName,
          }),
        };
      }
      const value = String(rawValue);
      if (value === '') {
        delete result[definition.name];
        continue;
      }
      if (definition.kind === 'number' && Number.isNaN(Number(value))) {
        return {
          status: 422,
          body: errorBody('HRC-CORE-0002', 'The submitted data is not valid.', {
            fields: { [definition.name]: ['This field takes a number.'] },
          }),
        };
      }
      if (definition.kind === 'choice' && !definition.choices.includes(value)) {
        return {
          status: 422,
          body: errorBody('HRC-CORE-0002', 'The submitted data is not valid.', {
            fields: {
              [definition.name]: [
                `This field must be one of: ${definition.choices.join(', ')}.`,
              ],
            },
          }),
        };
      }
      result[definition.name] =
        definition.kind === 'number' ? normalizeNumber(value) : value;
    }
    return { fields: result };
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      const requestUrl = new URL(req.url ?? '/', 'http://localhost');
      const route = `${req.method} ${requestUrl.pathname}`;

      if (route === 'POST /__reset') {
        entries = new Map();
        nextId = 1;
        return json(res, 204, null);
      }

      if (route === 'GET /api/health') {
        const body: HealthOut = {
          status: 'ok',
          service: 'fake-hrcek',
          version: '0.0.0',
          message: 'Service is running.',
        };
        return json(res, 200, body);
      }

      if (route === 'POST /api/auth/login') {
        const body = (await readBody(req)) as {
          identifier?: string;
          password?: string;
        };
        if (body.identifier !== FAKE_IDENTIFIER || body.password !== FAKE_PASSWORD) {
          return json(
            res,
            401,
            errorBody('HRC-AUTH-0001', 'Invalid credentials.'),
          );
        }
        res.setHeader('Set-Cookie', [
          `sessionid=${SESSION_ID}; Path=/`,
          `csrftoken=${CSRF_TOKEN}; Path=/`,
        ]);
        return json(res, 200, FAKE_USER);
      }

      // GET / stands in for any page that makes Django set the CSRF cookie.
      if (route === 'GET /') {
        res.setHeader('Set-Cookie', [`csrftoken=${CSRF_TOKEN}; Path=/`]);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html>fake hrcek</html>');
      }

      const authError = checkAuth(req);
      if (authError !== null) return json(res, authError.status, authError.body);

      if (route === 'GET /api/auth/me') {
        return json(res, 200, FAKE_USER);
      }

      if (route === 'GET /api/entries/by-url/') {
        const url = requestUrl.searchParams.get('url') ?? '';
        const entry = entries.get(normalizeUrl(url));
        if (entry === undefined) {
          return json(
            res,
            404,
            errorBody('HRC-CORE-0003', 'The requested resource does not exist.', {
              url,
            }),
          );
        }
        return json(res, 200, entry);
      }

      if (route === 'POST /api/entries/') {
        const body = (await readBody(req)) as {
          url?: string;
          title?: string;
          notes?: string;
          tags?: string[];
          fields?: Record<string, unknown> | null;
        };
        if (typeof body.url !== 'string' || !isValidUrl(body.url)) {
          return json(
            res,
            422,
            errorBody('HRC-CORE-0002', 'The submitted data is not valid.', {
              fields: { url: ['Enter a valid URL.'] },
            }),
          );
        }
        const key = normalizeUrl(body.url);
        const existing = entries.get(key);
        const applied = applyFields(existing?.fields ?? {}, body.fields ?? {});
        if ('status' in applied) return json(res, applied.status, applied.body);

        const now = timestamp();
        const entry: EntryOut = {
          id: existing?.id ?? nextId++,
          url: key,
          title: body.title ?? '',
          notes: body.notes ?? '',
          tags: [...(body.tags ?? [])].sort(),
          fields: applied.fields,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        entries.set(key, entry);
        return json(res, existing === undefined ? 201 : 200, entry);
      }

      return json(
        res,
        404,
        errorBody('HRC-CORE-0003', 'The requested resource does not exist.'),
      );
    })().catch(() => {
      json(res, 500, errorBody('HRC-CORE-0001', 'Something went wrong.'));
    });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    reset() {
      entries = new Map();
      nextId = 1;
    },
    close() {
      return new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
```

Note on `json(res, 204, null)`: a 204 must not have a body — if Node complains, replace that line with `res.writeHead(204).end()`.

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm vitest run tests/fake-hrcek/server.test.ts`
Expected: PASS. If the timestamp test ordering matters, remember `updated_at` must differ between the create and the update (the `clock` counter guarantees it).

- [ ] **Step 5: Create the CLI runner for Playwright**

```ts
// tests/fake-hrcek/main.ts
import { startFakeHrcek } from './server';

const port = Number(process.env.PORT ?? 8787);
const fake = await startFakeHrcek(port);
console.log(`fake-hrcek listening on ${fake.url}`);
```

Run: `pnpm tsx tests/fake-hrcek/main.ts & sleep 1 && curl -s http://127.0.0.1:8787/api/health && kill %1`
Expected: the health JSON prints.

- [ ] **Step 6: Commit**

```bash
git add tests/fake-hrcek/
git commit -m "feat: in-memory fake Hrček server for e2e and contract tests"
```

---

### Task 9: Playwright e2e suite

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/save-flow.spec.ts`

**Interfaces:**
- Consumes: the built e2e extension (`pnpm build:e2e` → `.output/chrome-mv3`), the fake server CLI (Task 8), popup/options DOM contracts (Tasks 6–7), `FAKE_TOKEN`/`FAKE_IDENTIFIER`/`FAKE_PASSWORD` (Task 8).
- Produces: `pnpm test:e2e` — the command CI runs.

- [ ] **Step 1: Create playwright.config.ts**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // e2e specs must not be picked up by vitest (vitest.config.ts excludes tests/e2e).
  webServer: {
    command: 'pnpm tsx tests/fake-hrcek/main.ts',
    port: 8787,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: Create the extension fixtures**

```ts
// tests/e2e/fixtures.ts
import path from 'node:path';
import { test as base, chromium, type BrowserContext } from '@playwright/test';

export const SERVER = 'http://127.0.0.1:8787';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const extensionPath = path.resolve('.output/chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', // headless chromium supports extensions
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;
```

- [ ] **Step 3: Write the e2e specs**

```ts
// tests/e2e/save-flow.spec.ts
import type { BrowserContext, Page } from '@playwright/test';
import { expect, SERVER, test } from './fixtures';

const FAKE_TOKEN = 'hrcek_test_token';
const FAKE_IDENTIFIER = 'nina@example.com';
const FAKE_PASSWORD = 'correct horse';

test.beforeEach(async () => {
  await fetch(`${SERVER}/__reset`, { method: 'POST' });
});

async function openOptions(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  return page;
}

async function configureToken(context: BrowserContext, extensionId: string): Promise<void> {
  const page = await openOptions(context, extensionId);
  await page.fill('#server-url', SERVER);
  await page.check('#mode-token');
  await page.fill('#token', FAKE_TOKEN);
  await page.click('#save');
  await expect(page.locator('#status')).toHaveAttribute('data-kind', 'success');
  await page.close();
}

async function openPopup(
  context: BrowserContext,
  extensionId: string,
  url: string,
  title: string,
): Promise<Page> {
  const page = await context.newPage();
  const query = new URLSearchParams({ url, title });
  await page.goto(`chrome-extension://${extensionId}/popup.html?${query}`);
  return page;
}

test('shows a pointer to settings when unconfigured', async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId, 'https://example.com/a', 'A');
  await expect(popup.locator('#open-options')).toBeVisible();
});

test('options page saves settings and tests the connection', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const page = await openOptions(context, extensionId);
  await page.click('#test');
  await expect(page.locator('#status')).toContainText('nina@example.com');
});

test('saves a new entry from the popup', async ({ context, extensionId }) => {
  await configureToken(context, extensionId);
  const popup = await openPopup(context, extensionId, 'https://example.com/watch', 'A watch');

  await expect(popup.locator('#url')).toHaveValue('https://example.com/watch');
  await expect(popup.locator('#title')).toHaveValue('A watch');
  await popup.fill('#notes', '38mm, sapphire');
  await popup.fill('#tags', 'watches, diving');
  await popup.click('#save');

  await expect(popup.locator('#status')).toContainText('Saved.');
});

test('reopening a saved address prefills the existing entry and updates it', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const first = await openPopup(context, extensionId, 'https://example.com/watch', 'A watch');
  await first.fill('#notes', 'original notes');
  await first.click('#save');
  await expect(first.locator('#status')).toContainText('Saved.');
  await first.close();

  const second = await openPopup(context, extensionId, 'https://example.com/watch', 'ignored');
  await expect(second.locator('#existing-note')).toBeVisible();
  await expect(second.locator('#notes')).toHaveValue('original notes');
  await second.fill('#title', 'A watch, revisited');
  await second.click('#save');
  await expect(second.locator('#status')).toContainText('Updated.');
});

test('shows the server message for an unknown field', async ({ context, extensionId }) => {
  await configureToken(context, extensionId);
  const popup = await openPopup(context, extensionId, 'https://example.com/x', 'X');

  await popup.click('#add-field');
  await popup.fill('.field-name', 'colour');
  await popup.fill('.field-value', 'red');
  await popup.click('#save');

  await expect(popup.locator('#status')).toHaveAttribute('data-kind', 'error');
  await expect(popup.locator('#status')).toContainText('no field with that name');
});

test('password mode: logs in and saves through the session with CSRF', async ({
  context,
  extensionId,
}) => {
  const options = await openOptions(context, extensionId);
  await options.fill('#server-url', SERVER);
  await options.check('#mode-session');
  await options.fill('#identifier', FAKE_IDENTIFIER);
  await options.fill('#password', FAKE_PASSWORD);
  await options.click('#save');
  await expect(options.locator('#status')).toContainText('Signed in as nina@example.com');
  await expect(options.locator('#password')).toHaveValue(''); // never kept
  await options.close();

  const popup = await openPopup(context, extensionId, 'https://example.com/s', 'S');
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Saved.');
});
```

- [ ] **Step 4: Install the browser and run the suite**

Run: `pnpm exec playwright install chromium && pnpm test:e2e`
Expected: all 6 tests PASS. Known variables if something fails:
- Extension not loading headless → the `channel: 'chromium'` line is required (headless shell does not support extensions).
- `serviceworker` event never fires → the background entrypoint must exist in the build; check `.output/chrome-mv3/manifest.json` has a `background` key.
- Fetches to the fake server blocked → confirm the e2e build's manifest grants `http://127.0.0.1/*` and `http://localhost/*` (Task 1, Step 3 note).
- Session test failing on cookies → `browser.cookies.get` requires the cookies permission AND host access; both are in the e2e build.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/
git commit -m "test: Playwright e2e suite for save and options flows"
```

---

### Task 10: Contract tests (fake always, real Hrček opt-in)

**Files:**
- Create: `tests/contract/suite.ts`
- Create: `tests/contract/fake.test.ts`
- Create: `tests/contract/real.test.ts`

**Interfaces:**
- Consumes: `HrcekClient`/`TokenAuth` (Task 3), `loadExisting` (Task 5), fake server (Task 8).
- Produces: a shared contract suite proving the client speaks the same protocol to the fake and to a real Hrček. Real run: `HRCEK_URL=http://127.0.0.1:8000 HRCEK_TOKEN=hrcek_… pnpm vitest run tests/contract/real.test.ts`.

- [ ] **Step 1: Write the shared suite (failing only until wired)**

```ts
// tests/contract/suite.ts
import { describe, expect, it } from 'vitest';
import { TokenAuth } from '../../src/lib/api/auth';
import { HrcekClient } from '../../src/lib/api/client';
import { loadExisting } from '../../src/lib/save';

export interface ContractTarget {
  baseUrl: string;
  token: string;
  /** Unique per run so re-runs against a real server never collide. */
  runId: string;
}

export function runContractSuite(name: string, target: () => ContractTarget): void {
  describe(`Hrček API contract (${name})`, () => {
    const client = () => new HrcekClient(target().baseUrl, new TokenAuth(target().token));
    const testUrl = (slug: string) =>
      `https://contract-tests.example.com/${target().runId}/${slug}`;

    it('reports health', async () => {
      expect((await client().health()).status).toBe('ok');
    });

    it('identifies the token owner', async () => {
      expect((await client().me()).email).toContain('@');
    });

    it('creates, then updates, an entry at the same address', async () => {
      const url = testUrl('upsert');
      const first = await client().saveEntry({ url, title: 'first' });
      expect(first.status).toBe('created');

      const second = await client().saveEntry({ url, title: 'second' });
      expect(second.status).toBe('updated');
      expect(second.entry.id).toBe(first.entry.id);
      expect(second.entry.title).toBe('second');
    });

    it('answers null for an address not held', async () => {
      expect(await loadExisting(client(), testUrl('never-saved'))).toBeNull();
    });

    it('finds a held address via by-url', async () => {
      const url = testUrl('by-url');
      await client().saveEntry({ url });
      expect((await loadExisting(client(), url))?.url).toBe(url);
    });

    it('rejects an unknown field name with HRC-FIELD-0001', async () => {
      const error = await client()
        .saveEntry({ url: testUrl('bad-field'), fields: { 'no-such-field-x': '1' } })
        .then(() => null, (e: { code?: string }) => e);
      expect(error?.code).toBe('HRC-FIELD-0001');
    });
  });
}
```

- [ ] **Step 2: Wire it to the fake**

```ts
// tests/contract/fake.test.ts
import { afterAll, beforeAll } from 'vitest';
import { FAKE_TOKEN, startFakeHrcek, type FakeHrcek } from '../fake-hrcek/server';
import { runContractSuite } from './suite';

let fake: FakeHrcek;

beforeAll(async () => {
  fake = await startFakeHrcek(0);
});
afterAll(async () => {
  await fake.close();
});

runContractSuite('fake', () => ({
  baseUrl: fake.url,
  token: FAKE_TOKEN,
  runId: crypto.randomUUID(),
}));
```

- [ ] **Step 3: Wire the opt-in real target**

```ts
// tests/contract/real.test.ts
// Opt-in: writes entries into the token owner's real account (all under
// https://contract-tests.example.com/<uuid>/…). Point it at a local dev
// Hrček, not at one whose data you care about.
import { describe } from 'vitest';
import { runContractSuite } from './suite';

const url = process.env.HRCEK_URL;
const token = process.env.HRCEK_TOKEN;

if (url === undefined || token === undefined) {
  describe.skip('Hrček API contract (real — set HRCEK_URL and HRCEK_TOKEN)', () => {});
} else {
  runContractSuite('real', () => ({
    baseUrl: url.replace(/\/+$/, ''),
    token,
    runId: crypto.randomUUID(),
  }));
}
```

- [ ] **Step 4: Run against the fake, expect pass**

Run: `pnpm test`
Expected: contract (fake) suite PASSES; real suite reports skipped.

- [ ] **Step 5: Run once against real Hrček (if one is running locally)**

Run (only if a dev server is up in ../hrcek and you hold a token):
`HRCEK_URL=http://127.0.0.1:8000 HRCEK_TOKEN=<token> pnpm vitest run tests/contract/real.test.ts`
Expected: PASS. If no server is available, note it and move on — this is the opt-in path.

- [ ] **Step 6: Commit**

```bash
git add tests/contract/
git commit -m "test: API contract suite against fake and opt-in real Hrček"
```

---

### Task 11: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: every command defined in Task 1's package.json.
- Produces: CI on push/PR to main.

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
      - run: pnpm build
      - run: pnpm zip
      - uses: actions/upload-artifact@v4
        with:
          name: firefox-zip
          path: .output/*.zip
```

- [ ] **Step 2: Verify locally that each command works in sequence**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build && pnpm zip`
Expected: everything passes; `.output/` contains a `hrcek-extension-0.1.0-firefox.zip` (or similarly named) archive. Unzip it and confirm it contains NO `*.test.*` files and nothing from `tests/`.

- [ ] **Step 3: Commit and push; watch the first CI run**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck, lint, unit, e2e, build, zip"
git push
gh run watch
```

Expected: green. If pnpm/node versions mismatch the runner, align the workflow versions with local (`pnpm --version`, `node --version`).

---

### Task 12: CLAUDE.md and README

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`

**Interfaces:**
- Consumes: everything above (documents it).
- Produces: the working agreement future sessions load.

- [ ] **Step 1: Write CLAUDE.md**

```markdown
# Hrček extension — working agreement

Browser extension clients for the Hrček link-saving service. Firefox
ships first; Chrome and Safari build from the same code. The server
lives in `../hrcek` — its API guide is `../hrcek/docs/dev/api.md`, its
error codes `../hrcek/docs/dev/error-codes.md`, and its OpenAPI schema
is vendored here at `docs/api/openapi.json`.

Design spec: `docs/superpowers/specs/2026-09-16-hrcek-extension-design.md`.

## Commands

- `pnpm dev` — run in real Firefox with auto-reload (primary target)
- `pnpm test` / `pnpm test:watch` — unit + contract tests (Vitest)
- `pnpm test:e2e` — builds the e2e Chrome target, runs Playwright
  against the in-repo fake Hrček (`tests/fake-hrcek/`)
- `HRCEK_URL=… HRCEK_TOKEN=… pnpm vitest run tests/contract/real.test.ts`
  — contract tests against a real, locally running Hrček (opt-in)
- `pnpm typecheck && pnpm lint` — must pass before any commit
- `pnpm build` / `pnpm zip` — Firefox production build / AMO zip
- `pnpm refresh-schema` — re-vendor `openapi.json` from `../hrcek` and
  regenerate `src/lib/api/types.gen.ts`. Run when the server API changes.

## Architecture rules

- **`src/lib/` never imports from `src/entrypoints/`.** All reusable
  logic (API client, auth, settings, save flow) lives in `lib/`;
  entrypoints are thin DOM wiring.
- **Browser-specific code climbs a ladder — always use the lowest rung
  that works:** (1) per-browser manifest config in `wxt.config.ts`;
  (2) `import.meta.env.FIREFOX`-style build-time switches;
  (3) a platform module in `src/lib/platform/` behind a shared
  interface; (4) per-browser entrypoints. Adding a browser must be a
  build target, not a port.
- `src/lib/api/types.gen.ts` is generated — never edit it by hand.

## API gotchas (they bite)

- `POST /api/entries/` is an upsert: 201 created, 200 updated. It
  REPLACES the entry — omitted attributes are cleared — EXCEPT
  `fields`, which is PATCHED (send `""` to clear one field; omitting
  `fields` changes none of them).
- Always look before writing: `GET /api/entries/by-url/` (404 +
  `HRC-CORE-0003` means not held). The popup does this on open.
- Branch on error `code`, never on `message` — messages are translated
  and may be reworded. Show `message` to people, though.
- Never hard-code field names. `Price`/`Priority` are only the defaults
  of a fresh account; fields are per-account, renameable, deletable.
- Addresses match on trimmed whitespace + lowercased scheme/host and
  nothing else: a trailing slash or `www.` is a different address.

## Security rules

- The API token lives in `browser.storage.local` only — never
  `storage.sync` (unencrypted, replicated).
- The password is NEVER persisted anywhere. It is used once for
  `POST /api/auth/login`; the session cookie carries auth after that,
  and the person is re-prompted when the session expires.
- The manifest requires no host permissions; the configured server's
  origin is requested at runtime from the options page. Only the
  `--mode e2e` build adds localhost host permissions, for Playwright.

## Testing expectations

- TDD: behavior changes start with a failing test. Unit tests are
  colocated (`*.test.ts` next to the source).
- The fake Hrček (`tests/fake-hrcek/server.ts`) is typed against the
  generated schema and mirrors documented behavior including error
  codes; when the server API changes, update fake + tests together
  with `pnpm refresh-schema`.
- Production zips must contain no test code — WXT only bundles
  entrypoints; keep test files out of `src/entrypoints/` imports.
- e2e runs in Chromium (Playwright cannot load Firefox extensions);
  Firefox is covered by unit tests plus `pnpm dev` smoke checks.

## Before AMO submission (future)

- Replace the placeholder gecko id in `wxt.config.ts`.
- Add real icons.
```

- [ ] **Step 2: Write README.md**

```markdown
# Hrček extension

Browser extension for saving links to a [Hrček](../hrcek) server.
Firefox first; Chrome and Safari build from the same codebase.

## Develop

Requires [pnpm](https://pnpm.io) and Node 22+.

```bash
pnpm install
pnpm dev          # runs in real Firefox with auto-reload
pnpm test         # unit + contract tests
pnpm test:e2e     # Playwright e2e (Chromium + in-repo fake server)
pnpm build        # production Firefox build
pnpm zip          # AMO-ready zip
```

See `CLAUDE.md` for architecture rules and `docs/superpowers/specs/`
for the design.
```

- [ ] **Step 3: Verify lint still passes (prettier checks markdown)**

Run: `pnpm lint`
Expected: PASS (run `pnpm format` if prettier objects to the new files).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: working agreement and README"
```

---

## Self-review notes

- Spec coverage: popup save/edit with look-before-write (Tasks 5–6), options with both auth modes and test-connection (Task 7), token-only storage / never-persist password (Tasks 4, 7), optional host permission (Tasks 1, 7), generated types + refresh script (Task 2), error-code branching (Tasks 3, 5), fake server typed against schema (Task 8), e2e in Chromium (Task 9), opt-in real-Hrček contract run (Task 10), CI (Task 11), CLAUDE.md (Task 12), queue-ready submit boundary (Task 5). Batch saving and the entries list are explicitly out of v1 scope.
- The popup/options DOM wiring is deliberately not unit-tested; its logic lives in tested `lib/` and `form.ts` modules, and the DOM contract is exercised by six e2e tests.
- Known risk spots are called out inline where the executor must verify reality: manifest key placement (Task 1 Step 3), generated schema names (Task 2 Step 2), headless extension support and cookie behavior (Task 9 Step 4).
```
