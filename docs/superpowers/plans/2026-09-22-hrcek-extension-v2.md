# Hrček extension v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the extension toolbar icons that say what state it is in, a form built from the account's own fields and labels, a picture chosen from the page, safe updates to entries already held, and the website's look in both themes.

**Architecture:** All logic goes in `src/lib/`, which never imports from `src/entrypoints/`; entrypoints stay thin DOM wiring. The three new decision-making modules (`candidates.ts`, `picture.ts`, `saved-state.ts`) are pure — they take their clock, fetcher and browser calls as arguments — so every rule is testable in node without a browser. Browser differences climb the ladder in `CLAUDE.md`: manifest config first, then build-time switches, then a platform module, and only then per-browser entrypoints.

**Tech Stack:** TypeScript, WXT 0.21 (MV2 for Firefox, MV3 for Chrome), Vitest + msw for unit and contract tests, Playwright for e2e against the in-repo fake Hrček, ImageMagick for one-off icon generation.

**Spec:** `docs/superpowers/specs/2026-09-22-hrcek-extension-v2-design.md` — read it before starting. It carries the reasoning this plan only executes.

## Global Constraints

- **`src/lib/` never imports from `src/entrypoints/`.** Entrypoints import from lib, never the reverse.
- **`src/lib/api/types.gen.ts` is generated.** Never hand-edit it.
- **Branch on error `code`, never on `message`.** Messages are translated. Show `message` to people.
- **Never hard-code field or label names.** `Price` and `Priority` are only a fresh account's defaults.
- **The token lives in `browser.storage.local` only.** Never `storage.sync`. The password is never persisted.
- **The API client sends `credentials: 'omit'` everywhere.** Session auth is not an option; do not reintroduce it.
- **UI wording follows the website:** Address, Title, Notes, Picture, Tags.
- **TDD.** Every behaviour change starts with a failing test. Unit tests are colocated as `*.test.ts` beside the source.
- **`pnpm typecheck && pnpm lint && pnpm test` must pass before every commit.** The `.githooks/pre-commit` hook enforces it. Never use `--no-verify`.
- **Tests run in node by default.** A test that touches the DOM must start with `// @vitest-environment jsdom`.
- **Never edit `src/entrypoints/**` to import test files.** Production zips must contain no test code.
- **Commit messages carry no AI attribution trailers.** No `Co-Authored-By`, no `Generated with`.
- **Design tokens are copied verbatim** from `../hrcek/src/hrcek/core/static_src/hrcek.css`. Do not invent colours.

---

## File Structure

**Created:**

| Path                                                  | Responsibility                                                |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `assets/hrcek6.png`, `assets/hrcek-small.png`         | Icon sources, committed so the script can be re-run           |
| `scripts/make-icons.sh`                               | Generates every icon from `assets/hrcek6.png`                 |
| `src/public/icon/{16,32,48,96,128}.png`               | Colour icon set; WXT wires these into the manifest            |
| `src/public/icon/grey-{16,…}.png`, `saved-{16,…}.png` | The other two states, set at runtime                          |
| `src/lib/platform/action.ts`                          | `browser.action` (MV3) vs `browser.browserAction` (MV2)       |
| `src/lib/platform/inject.ts`                          | `scripting.executeScript` (MV3) vs `tabs.executeScript` (MV2) |
| `src/lib/ui/theme.css`                                | The design tokens and shared element styling                  |
| `src/lib/fields.ts`                                   | Field definitions → form model → request `fields` object      |
| `src/lib/tags.ts`                                     | The chip model: add, remove, duplicate rules                  |
| `src/lib/page/candidates.ts`                          | Ranking and de-duplication of harvested images                |
| `src/lib/picture.ts`                                  | Bytes vs `image_url` vs delete, and running it                |
| `src/lib/saved-state.ts`                              | The per-address cache and lookup policy                       |
| `src/entrypoints/harvest.ts`                          | Unlisted script that reads the page's images                  |
| `src/entrypoints/popup/picker.ts`                     | The picture picker's DOM and state                            |
| `src/entrypoints/popup/chips.ts`                      | The tag chip input's DOM and keys                             |

**Modified:**

| Path                                                                  | Change                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/lib/api/client.ts`                                               | `listFields`, `listLabels`, `uploadImage`, `deleteImage` |
| `src/lib/api/types.ts`                                                | Export the new generated types                           |
| `src/lib/api/types.gen.ts`                                            | Regenerated by `pnpm refresh-schema`                     |
| `docs/api/openapi.json`                                               | Re-vendored by `pnpm refresh-schema`                     |
| `src/lib/settings.ts`                                                 | `showSavedState`                                         |
| `src/lib/save.ts`                                                     | The save rules                                           |
| `src/entrypoints/background.ts`                                       | Icon state, per-tab lookups                              |
| `src/entrypoints/popup/main.ts`, `form.ts`, `style.css`, `index.html` | The new form                                             |
| `src/entrypoints/options/main.ts`, `style.css`                        | Restyle, the switch                                      |
| `wxt.config.ts`                                                       | `scripting` permission on MV3                            |
| `tests/fake-hrcek/server.ts`                                          | Fields, labels, image routes, `image_url`                |
| `tests/contract/suite.ts`                                             | Contract coverage for the new calls                      |
| `tests/e2e/save-flow.spec.ts`                                         | Picture and update journeys                              |

---

## The stack

Eight branches, each on the one below, rooted on `v2-design-spec` (which holds the spec and this plan).

```
main
 └── v2-design-spec      ← already committed
  └── icons
   └── api-fields-labels
    └── design-tokens
     └── fields-details
      └── tag-chips
       └── entry-updates
        └── picture
         └── saved-badge
```

Set up once, before Task 1:

```bash
git config rerere.enabled true
git config remote.pushDefault origin
gh stack init --base main v2-design-spec
```

Then at the start of each PR's first task, create its branch with `gh stack add <name>` (run from the top of the stack — `gh stack top` first if unsure). At the end of every PR, run `gh stack submit --auto` so the PR exists and is linked before the next branch starts.

---

# PR 1 — `icons`

Colour, greyscale and ticked icon sets, and the toolbar showing configured-versus-not. Depends on nothing.

### Task 1: Generate the three icon sets

**Files:**

- Create: `assets/hrcek6.png`, `assets/hrcek-small.png` (copied from the repo root of the main checkout)
- Create: `scripts/make-icons.sh`
- Create: `src/public/icon/{16,32,48,96,128}.png`, `src/public/icon/grey-{16,32,48,96,128}.png`, `src/public/icon/saved-{16,32,48,96,128}.png`
- Modify: `wxt.config.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: icon paths `icon/16.png` … `icon/128.png`, `icon/grey-16.png` …, `icon/saved-16.png` … — all relative to the extension root, which is how `setIcon` wants them.

- [ ] **Step 1: Copy the sources into the repo**

The two PNGs live in the main checkout's root and are not committed. Copy them in:

```bash
mkdir -p assets
cp /Users/markos/work/hrcek/hrcek-extension/hrcek6.png assets/hrcek6.png
cp /Users/markos/work/hrcek/hrcek-extension/hrcek-small.png assets/hrcek-small.png
```

`hrcek6.png` is a 1312×1199 transparent hamster head — the icon source. `hrcek-small.png` is the full mascot on a white background; it is committed for the store listing only and is **not** used by the script or the extension.

- [ ] **Step 2: Write the generation script**

Create `scripts/make-icons.sh`:

```bash
#!/bin/sh
# Builds every toolbar icon from assets/hrcek6.png.
#
# Three states: colour (configured, page not held), greyscale (not
# configured), and colour with a green tick (page already held). Each is
# rendered once at 512px and then scaled down, so the tick is drawn at a
# size where its geometry is legible and shrinks cleanly — drawing it at
# 16px directly gives a green smudge.
#
# Needs ImageMagick 7 (`magick`). The output is committed; this runs by
# hand when the artwork changes, not during a build.
set -eu

SRC="assets/hrcek6.png"
OUT="src/public/icon"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT"

# Square, trimmed and centred, with a little breathing room so the ears
# are not flush against the edge of the toolbar button.
magick "$SRC" -trim +repage \
  -resize 460x460 -background none -gravity center -extent 512x512 \
  "$WORK/colour.png"

# Saturation to zero rather than -colorspace Gray: it leaves the alpha
# channel alone, and a flattened alpha would give the icon a black box.
magick "$WORK/colour.png" -modulate 100,0,100 "$WORK/grey.png"

# The tick: a green disc with a white outline so it reads against both
# the hamster and a dark toolbar, and a white check drawn over it.
magick "$WORK/colour.png" \
  -fill '#1f9d55' -stroke white -strokewidth 22 \
  -draw "circle 366,366 366,216" \
  -fill none -stroke white -strokewidth 40 \
  -strokelinecap round -strokelinejoin round \
  -draw "polyline 300,368 348,416 434,318" \
  "$WORK/saved.png"

for size in 16 32 48 96 128; do
  magick "$WORK/colour.png" -resize "${size}x${size}" "$OUT/$size.png"
  magick "$WORK/grey.png"   -resize "${size}x${size}" "$OUT/grey-$size.png"
  magick "$WORK/saved.png"  -resize "${size}x${size}" "$OUT/saved-$size.png"
done

echo "Wrote 15 icons to $OUT"
```

- [ ] **Step 3: Run it and look at the result**

```bash
chmod +x scripts/make-icons.sh
sh scripts/make-icons.sh
```

Expected: `Wrote 15 icons to src/public/icon`. Open `src/public/icon/16.png`, `grey-16.png` and `saved-16.png` and confirm three things by eye: the head fills the square, the grey one has no colour left, and the tick is visible at 16px. If the tick is a blob, raise the circle radius (the `216` in the `circle` draw is a point on the perimeter — lower it to grow the disc) and re-run.

- [ ] **Step 4: Point the manifest at the colour set**

WXT picks up `src/public/icon/{16,32,48,96,128}.png` by convention, but the runtime states need `action` declared. In `wxt.config.ts`, add inside the `manifest` object returned by the function, after `description`:

```ts
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
```

WXT rewrites `action` to `browser_action` for MV2, so this is rung one of the browser ladder and needs no code.

- [ ] **Step 5: Verify the build carries the icons**

```bash
pnpm build && ls .output/firefox-mv2/icon/
```

Expected: the fifteen PNGs are present, and `.output/firefox-mv2/manifest.json` has a `browser_action.default_icon` map.

- [ ] **Step 6: Commit**

```bash
gh stack add icons
git add assets scripts/make-icons.sh src/public/icon wxt.config.ts
git commit -m "feat: draw the toolbar hamster in three states"
```

### Task 2: Show configured versus not configured

**Files:**

- Create: `src/lib/platform/action.ts`
- Create: `src/lib/icon.ts`, `src/lib/icon.test.ts`
- Modify: `src/entrypoints/background.ts`

**Interfaces:**

- Consumes: the icon paths from Task 1.
- Produces:
  - `type IconState = 'unconfigured' | 'configured' | 'saved'`
  - `iconPaths(state: IconState): Record<number, string>`
  - `setIcon(state: IconState, tabId?: number): Promise<void>` from `src/lib/icon.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/icon.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { iconPaths } from './icon';

describe('iconPaths', () => {
  it('serves the plain hamster when configured but the page is not held', () => {
    expect(iconPaths('configured')).toEqual({
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    });
  });

  it('greys the hamster out when there is nothing configured', () => {
    expect(iconPaths('unconfigured')[16]).toBe('icon/grey-16.png');
  });

  it('ticks the hamster when the page is already held', () => {
    expect(iconPaths('saved')[128]).toBe('icon/saved-128.png');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/lib/icon.test.ts
```

Expected: FAIL — `Failed to resolve import "./icon"`.

- [ ] **Step 3: Write the platform module**

Create `src/lib/platform/action.ts`:

```ts
import { browser } from 'wxt/browser';

/**
 * The toolbar button, whatever this manifest version calls it. MV3 has
 * `action`, MV2 has `browserAction`; the two carry the same `setIcon`,
 * so one interface covers both. Rung three of the browser ladder — a
 * build-time switch cannot help, because the object itself differs.
 */
interface ToolbarAction {
  setIcon(details: { path: Record<number, string>; tabId?: number }): Promise<void>;
}

export function toolbarAction(): ToolbarAction {
  const api = browser as unknown as Record<string, unknown>;
  return (api['action'] ?? api['browserAction']) as ToolbarAction;
}
```

- [ ] **Step 4: Write the icon module**

Create `src/lib/icon.ts`:

```ts
import { toolbarAction } from './platform/action';

/** What the toolbar button is saying right now. */
export type IconState = 'unconfigured' | 'configured' | 'saved';

const SIZES = [16, 32, 48, 128] as const;

const PREFIX: Record<IconState, string> = {
  unconfigured: 'grey-',
  configured: '',
  saved: 'saved-',
};

export function iconPaths(state: IconState): Record<number, string> {
  const paths: Record<number, string> = {};
  for (const size of SIZES) paths[size] = `icon/${PREFIX[state]}${size}.png`;
  return paths;
}

/**
 * Setting an icon can fail for reasons nothing can be done about — the
 * tab closed between the lookup and the answer, most often. A toolbar
 * that did not repaint is not worth an unhandled rejection.
 */
export async function setIcon(state: IconState, tabId?: number): Promise<void> {
  try {
    await toolbarAction().setIcon({
      path: iconPaths(state),
      ...(tabId === undefined ? {} : { tabId }),
    });
  } catch {
    // The tab is gone. Nothing to repaint.
  }
}
```

- [ ] **Step 5: Run the test**

```bash
pnpm vitest run src/lib/icon.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Wire it into the background**

Replace `src/entrypoints/background.ts` entirely:

```ts
import { browser } from 'wxt/browser';
import { setIcon } from '../lib/icon';
import { loadSettings } from '../lib/settings';

/**
 * The toolbar button's resting state. Whether a particular page is
 * already held is decided per tab; that arrives in a later change.
 */
async function paintFromSettings(): Promise<void> {
  const settings = await loadSettings();
  const configured = settings !== null && settings.token !== null;
  await setIcon(configured ? 'configured' : 'unconfigured');
}

export default defineBackground(() => {
  void paintFromSettings();
  // The options page writes settings; the toolbar should not wait for a
  // restart to notice that a token arrived.
  browser.storage.local.onChanged.addListener((changes) => {
    if ('settings' in changes) void paintFromSettings();
  });
});
```

- [ ] **Step 7: Check it in a real browser**

```bash
pnpm dev
```

In the Firefox window that opens: the toolbar hamster should be grey. Open the extension's settings, save a server address and token, and watch it turn colour without reloading the extension.

- [ ] **Step 8: Commit**

```bash
git add src/lib/icon.ts src/lib/icon.test.ts src/lib/platform/action.ts src/entrypoints/background.ts
git commit -m "feat: grey the toolbar hamster until Hrcek is configured"
gh stack submit --auto
```

---

# PR 2 — `api-fields-labels`

The two new read-only calls, end to end: schema, client, fake server, contract tests. No UI.

### Task 3: Re-vendor the schema and export the new types

**Files:**

- Modify: `docs/api/openapi.json`, `src/lib/api/types.gen.ts` (both generated)
- Modify: `src/lib/api/types.ts`

**Interfaces:**

- Produces: `FieldOut`, `LabelOut`, `PagedFieldOut`, `PagedLabelOut`, `ImageOut` exported from `src/lib/api/types.ts`.

- [ ] **Step 1: Create the branch and refresh the schema**

```bash
gh stack add api-fields-labels
pnpm refresh-schema /Users/markos/work/hrcek/hrcek/docs/api/openapi.json
```

The script defaults to `../hrcek/docs/api/openapi.json`, which does not resolve from a worktree — hence the explicit path. Expected: `docs/api/openapi.json` and `src/lib/api/types.gen.ts` both change.

- [ ] **Step 2: Confirm the new schemas arrived**

```bash
grep -c 'FieldOut\|LabelOut' src/lib/api/types.gen.ts
```

Expected: a non-zero count. If it is zero, the server checkout is behind — it needs commit `a46e8a1` or later.

- [ ] **Step 3: Export the types**

Add to `src/lib/api/types.ts`:

```ts
export type FieldOut = components['schemas']['FieldOut'];
export type LabelOut = components['schemas']['LabelOut'];
export type PagedFieldOut = components['schemas']['PagedFieldOut'];
export type PagedLabelOut = components['schemas']['PagedLabelOut'];
export type ImageOut = components['schemas']['ImageOut'];
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add docs/api/openapi.json src/lib/api/types.gen.ts src/lib/api/types.ts
git commit -m "build: re-vendor the schema for fields and labels"
```

### Task 4: `listFields` and `listLabels` on the client

**Files:**

- Modify: `src/lib/api/client.ts`
- Modify: `src/lib/api/client.test.ts`

**Interfaces:**

- Consumes: `FieldOut`, `LabelOut` from Task 3.
- Produces:
  - `HrcekClient.listFields(): Promise<FieldOut[]>`
  - `HrcekClient.listLabels(options?: { startsWith?: string; after?: string }): Promise<LabelOut[]>`

Both answer the page's `items`. `count` is deliberately dropped: nothing in this extension pages through labels, and a caller that needed to would want the whole envelope, not a half-measure.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/api/client.test.ts`, inside the existing `describe('HrcekClient', …)` block:

```ts
it('listFields() returns the page items', async () => {
  server.use(
    http.get(`${BASE}/api/fields/`, () =>
      HttpResponse.json({
        items: [
          { name: 'Price', kind: 'number', options: [] },
          { name: 'Priority', kind: 'choice', options: ['high', 'medium', 'low'] },
        ],
        count: 2,
      }),
    ),
  );

  const fields = await client().listFields();
  expect(fields.map((f) => f.name)).toEqual(['Price', 'Priority']);
  expect(fields[1]!.options).toEqual(['high', 'medium', 'low']);
});

it('listLabels() passes starts_with through as a literal', async () => {
  server.use(
    http.get(`${BASE}/api/labels/`, ({ request }) => {
      // A literal, not a pattern: punctuation somebody typed means itself.
      expect(new URL(request.url).searchParams.get('starts_with')).toBe('c++');
      return HttpResponse.json({ items: [{ name: 'c++' }], count: 1 });
    }),
  );

  expect(await client().listLabels({ startsWith: 'c++' })).toEqual([{ name: 'c++' }]);
});

it('listLabels() sends no empty parameters when asked plainly', async () => {
  server.use(
    http.get(`${BASE}/api/labels/`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      expect(query.has('starts_with')).toBe(false);
      expect(query.has('after')).toBe(false);
      return HttpResponse.json({ items: [], count: 0 });
    }),
  );

  expect(await client().listLabels()).toEqual([]);
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm vitest run src/lib/api/client.test.ts
```

Expected: FAIL — `client().listFields is not a function`.

- [ ] **Step 3: Implement the two methods**

In `src/lib/api/client.ts`, widen the type import:

```ts
import type {
  EntryIn,
  EntryOut,
  FieldOut,
  HealthOut,
  LabelOut,
  PagedFieldOut,
  PagedLabelOut,
  TokenOut,
  UserOut,
} from './types';
```

and add, after `getEntryByUrl`:

```ts
  /**
   * The fields this account's entries may carry. `name` is the key an
   * entry's `fields` object uses, so what is read here is what gets
   * written back — never hard-code these.
   */
  async listFields(): Promise<FieldOut[]> {
    const page = (await (await this.request('GET', '/api/fields/')).json()) as PagedFieldOut;
    return page.items;
  }

  /**
   * This account's labels, alphabetically. `startsWith` narrows them and
   * is matched as a literal; `after` is a cursor, not an offset — pass
   * the last name served to get the next page.
   */
  async listLabels(
    options: { startsWith?: string; after?: string } = {},
  ): Promise<LabelOut[]> {
    const query = new URLSearchParams();
    // Sent only when they say something. The server defaults both to "",
    // so an empty parameter is noise on every keystroke.
    if (options.startsWith) query.set('starts_with', options.startsWith);
    if (options.after) query.set('after', options.after);
    const suffix = query.size > 0 ? `?${query}` : '';
    const page = (await (
      await this.request('GET', `/api/labels/${suffix}`)
    ).json()) as PagedLabelOut;
    return page.items;
  }
```

- [ ] **Step 4: Run the tests**

```bash
pnpm vitest run src/lib/api/client.test.ts
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/client.ts src/lib/api/client.test.ts
git commit -m "feat: read the fields and labels an account has defined"
```

### Task 5: Teach the fake Hrček to serve them

**Files:**

- Modify: `tests/fake-hrcek/server.ts`
- Modify: `tests/fake-hrcek/server.test.ts`
- Modify: `tests/contract/suite.ts`

**Interfaces:**

- Consumes: `listFields`, `listLabels` from Task 4.
- Produces: `GET /api/fields/` and `GET /api/labels/` on the fake, with `starts_with`, `after` and the 422 above 1000.

- [ ] **Step 1: Write the failing fake-server tests**

Append to `tests/fake-hrcek/server.test.ts`. It already has `fake`, a `beforeEach` that resets it, an `AUTH` header constant and a `post(body)` helper that posts to `/api/entries/` — use them rather than adding a second server:

```ts
describe('fields and labels', () => {
  it('serves the account fields with their kinds and options', async () => {
    const response = await fetch(`${fake.url}/api/fields/`, { headers: AUTH });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        { name: 'Price', kind: 'number', options: [] },
        { name: 'Priority', kind: 'choice', options: ['high', 'medium', 'low'] },
      ],
      count: 2,
    });
  });

  it('lists only labels that some entry carries, ignoring capitals in the order', async () => {
    await post({ url: 'https://example.com/a', tags: ['Watches', 'diving'] });
    await post({ url: 'https://example.com/b', tags: ['aviation'] });

    const response = await fetch(`${fake.url}/api/labels/`, { headers: AUTH });
    expect(await response.json()).toEqual({
      items: [{ name: 'aviation' }, { name: 'diving' }, { name: 'Watches' }],
      count: 3,
    });
  });

  it('narrows by starts_with as a literal, and pages by after', async () => {
    await post({ url: 'https://example.com/c', tags: ['watches', 'water', 'wave'] });

    const narrowed = await fetch(`${fake.url}/api/labels/?starts_with=wat`, {
      headers: AUTH,
    });
    expect(await narrowed.json()).toEqual({
      items: [{ name: 'watches' }, { name: 'water' }],
      count: 2,
    });

    const paged = await fetch(`${fake.url}/api/labels/?starts_with=wat&after=watches`, {
      headers: AUTH,
    });
    // count is how many match, not how many this page carries.
    expect(await paged.json()).toEqual({ items: [{ name: 'water' }], count: 2 });
  });

  it('refuses a limit above a thousand rather than truncating silently', async () => {
    const response = await fetch(`${fake.url}/api/labels/?limit=5000`, { headers: AUTH });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('HRC-CORE-0002');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm vitest run tests/fake-hrcek/server.test.ts
```

Expected: FAIL — the fake answers 404 `HRC-CORE-0003` for both paths.

- [ ] **Step 3: Give `ACCOUNT_FIELDS` the shape the API serves**

The existing constant uses `choices`; the API calls it `options`. Rename it so the fake speaks the API's language, in `tests/fake-hrcek/server.ts`:

```ts
/** A fresh Hrček account's default fields, in the shape GET /api/fields/ serves. */
const ACCOUNT_FIELDS = [
  { name: 'Price', kind: 'number' as const, options: [] as string[] },
  {
    name: 'Priority',
    kind: 'choice' as const,
    options: ['high', 'medium', 'low'],
  },
];
```

Then update the two uses inside `applyFields`: `definition.choices.includes(value)` becomes `definition.options.includes(value)`, and `definition.choices.join(', ')` becomes `definition.options.join(', ')`.

- [ ] **Step 4: Add the two routes**

In `tests/fake-hrcek/server.ts`, after the `GET /api/entries/by-url/` block:

```ts
if (route === 'GET /api/fields/') {
  return json(res, 200, {
    items: ACCOUNT_FIELDS,
    count: ACCOUNT_FIELDS.length,
  });
}

if (route === 'GET /api/labels/') {
  const limit = Number(requestUrl.searchParams.get('limit') ?? LABELS_PER_PAGE);
  if (!Number.isInteger(limit) || limit < 1 || limit > LABELS_PER_PAGE) {
    return json(
      res,
      422,
      errorBody('HRC-CORE-0002', 'The submitted data is not valid.', {
        fields: {
          limit: [`Ensure this value is less than or equal to ${LABELS_PER_PAGE}.`],
        },
      }),
    );
  }
  // Only labels some entry carries: the real server deletes a tag
  // when the last entry using it lets go.
  const names = new Set<string>();
  for (const entry of entries.values()) for (const tag of entry.tags) names.add(tag);

  const prefix = (requestUrl.searchParams.get('starts_with') ?? '').trim().toLowerCase();
  const after = (requestUrl.searchParams.get('after') ?? '').trim().toLowerCase();
  // Ordering and cursor both use the lowercased name so they agree
  // exactly; two labels cannot differ only by case, so no ties.
  const matching = [...names]
    .filter((name) => name.toLowerCase().startsWith(prefix))
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  const page = matching.filter((name) => name.toLowerCase() > after).slice(0, limit);

  return json(res, 200, {
    items: page.map((name) => ({ name })),
    // How many match, not how many this page carries.
    count: matching.length,
  });
}
```

and add the constant beside `TOKEN_NAME_MAX_LENGTH`:

```ts
/** Both the default and the maximum, as the real server publishes it. */
const LABELS_PER_PAGE = 1000;
```

- [ ] **Step 5: Run the fake's tests**

```bash
pnpm vitest run tests/fake-hrcek/server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add contract coverage**

In `tests/contract/suite.ts`, add two cases inside the suite's `describe`, beside the existing ones. The file already defines `client()` and `testUrl(slug)` helpers and reads `target().runId` — use those. Both cases must pass against a real Hrček too, so they assert only what the API guarantees, never the fixture's particular fields:

```ts
it('describes the fields an entry may carry', async () => {
  const fields = await client().listFields();
  // Never assert on Price or Priority: they are a fresh account's
  // defaults, renameable and deletable by their owner.
  for (const field of fields) {
    expect(typeof field.name).toBe('string');
    expect(['text', 'number', 'choice']).toContain(field.kind);
    expect(Array.isArray(field.options)).toBe(true);
    // Options are how a client learns a choice field's choices; every
    // other kind has none.
    if (field.kind !== 'choice') expect(field.options).toEqual([]);
  }
});

it('serves the labels an entry carries, and narrows them by prefix', async () => {
  // Unique per run, so this passes against a real account that already
  // has labels of its own.
  const tag = `contract-${target().runId.slice(0, 8)}`;
  await client().saveEntry({ url: testUrl('labels'), tags: [tag] });

  const all = await client().listLabels();
  expect(all.map((label) => label.name)).toContain(tag);

  const narrowed = await client().listLabels({ startsWith: tag.slice(0, 12) });
  expect(narrowed.map((label) => label.name)).toContain(tag);

  const elsewhere = await client().listLabels({ startsWith: 'zzz-no-such-prefix-' });
  expect(elsewhere).toEqual([]);
});
```

- [ ] **Step 7: Run the contract suite**

```bash
pnpm vitest run tests/contract/fake.test.ts
```

Expected: PASS. If a local Hrček is running, also check it against the real thing:

```bash
HRCEK_URL=http://127.0.0.1:8000 HRCEK_TOKEN=… pnpm vitest run tests/contract/real.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add tests/fake-hrcek/server.ts tests/fake-hrcek/server.test.ts tests/contract/suite.ts
git commit -m "test: mirror the fields and labels endpoints in the fake"
gh stack submit --auto
```

---

# PR 3 — `design-tokens`

The website's look, applied to the popup and options page as they stand. No behaviour change, so the existing tests must keep passing untouched.

### Task 6: The shared theme

**Files:**

- Create: `src/lib/ui/theme.css`
- Modify: `src/entrypoints/popup/style.css`, `src/entrypoints/popup/main.ts`, `src/entrypoints/popup/index.html`

**Interfaces:**

- Produces: `src/lib/ui/theme.css`, imported by both entrypoints' stylesheets.

- [ ] **Step 1: Create the branch and write the theme**

```bash
gh stack add design-tokens
```

Create `src/lib/ui/theme.css`. The token block is copied verbatim from `../hrcek/src/hrcek/core/static_src/hrcek.css` — do not adjust the values:

```css
/* The website's design tokens, copied from hrcek.css. Restyling starts
   and usually ends here. Each colour has a light and a dark variant; the
   dark block overrides the same properties, so both themes follow the
   system without any per-element dark styling. */

:root {
  color-scheme: light dark;

  --surface: #faf8f5;
  --raised: #ffffff;
  --edge: #e4dfd5;
  --ink: #292521;
  --muted: #6e6659;
  --accent: #8a4c22;
  --accent-ink: #ffffff;
  --danger: #b3261c;
  --danger-ink: #ffffff;

  --radius: 0.4375rem;
  --font-sans:
    ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    sans-serif;

  accent-color: var(--accent);
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface: #171512;
    --raised: #211e1a;
    --edge: #3b352c;
    --ink: #e9e4dc;
    --muted: #a49b8c;
    --accent: #d9986a;
    --accent-ink: #2b1607;
    --danger: #ef8983;
    --danger-ink: #2b0f0d;
  }
}

body {
  margin: 0;
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-sans);
  line-height: 1.5;
}

/* The site's header: the hamster, then the name. */
.hrcek-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.hrcek-header img {
  width: 1.25rem;
  height: 1.25rem;
}
.hrcek-header .name {
  font-weight: 700;
  letter-spacing: -0.01em;
}
/* Anything after the name is pushed to the far end — the "already saved"
   note today, and whatever else earns a place there later. */
.hrcek-header .aside {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  border: 1px solid var(--edge);
  border-radius: 99px;
  padding: 0.05rem 0.5rem;
  background: var(--raised);
}

label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 0.2rem;
}

input:not([type='checkbox']),
textarea,
select {
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  font: inherit;
  font-size: 0.8125rem;
  background: var(--raised);
  color: var(--ink);
  border: 1px solid var(--edge);
  border-radius: var(--radius);
}

input:focus-visible,
textarea:focus-visible,
select:focus-visible,
button:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

button {
  font: inherit;
  font-weight: 600;
  color: var(--accent-ink);
  background: var(--accent);
  border: 0;
  border-radius: var(--radius);
  padding: 0.45rem 0.9rem;
  cursor: pointer;
}
button:hover {
  background: color-mix(in oklab, var(--accent) 88%, var(--ink));
}
/* A button that should not look like the main action. */
button.quiet {
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--edge);
  font-weight: 400;
}
button.quiet:hover {
  background: var(--raised);
  color: var(--ink);
}

details {
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--raised);
  padding: 0.4rem 0.55rem;
}
summary {
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}

a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: color-mix(in oklab, var(--accent) 40%, transparent);
  text-underline-offset: 3px;
}
a:hover {
  text-decoration-color: var(--accent);
}

#status {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--muted);
}
#status[data-kind='error'] {
  color: var(--danger);
}
#status[data-kind='success'] {
  color: var(--accent);
}
```

- [ ] **Step 2: Rewrite the popup's stylesheet on top of it**

Replace `src/entrypoints/popup/style.css` entirely:

```css
@import '../../lib/ui/theme.css';

body {
  width: 360px;
  font-size: 0.8125rem;
}

#app {
  padding: 0.75rem;
}

/* The page's address: context, not an input. It is whatever tab you are
   on, and inviting a retype invites saving the wrong thing. */
.address {
  display: block;
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field {
  margin-bottom: 0.55rem;
}

textarea {
  min-height: 3rem;
  resize: vertical;
}

#save {
  width: 100%;
  margin-top: 0.35rem;
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
```

- [ ] **Step 3: Restyle the popup's markup**

In `src/entrypoints/popup/main.ts`, replace the body of `renderForm` down to the closing backtick of the template with:

```ts
app.innerHTML = `
    <div class="hrcek-header">
      <img src="/icon/32.png" alt="" />
      <span class="name">Hrček</span>
      ${existing ? '<span class="aside">Already saved</span>' : ''}
    </div>
    <span class="address" id="address" title=""></span>
    <form id="entry-form">
      <div class="field"><label for="title">Title</label><input id="title" /></div>
      <div class="field"><label for="notes">Notes</label><textarea id="notes" rows="3"></textarea></div>
      <div class="field"><label for="tags">Tags</label><input id="tags" placeholder="comma, separated" /></div>
      <div id="fields"></div>
      <button type="button" class="quiet" id="add-field">Add field</button>
      <button type="submit" id="save">${existing ? 'Update' : 'Save'}</button>
      <p id="status" data-kind="info"></p>
    </form>
  `;
const address = document.querySelector<HTMLSpanElement>('#address')!;
address.textContent = form.url;
address.title = form.url;
```

The `#url` input is gone, so replace the line that set its value, and change `collectForm`'s first property from reading `#url` to the field the address came from:

```ts
function collectForm(): FormState {
  return {
    // Not editable, so it is carried rather than read back from an input.
    url: pageUrl,
    title: document.querySelector<HTMLInputElement>('#title')!.value,
```

Delete the now-unused `existing-note` paragraph, and drop `renderUnconfigured`'s bare markup in favour of the header too:

```ts
function renderUnconfigured(): void {
  app.innerHTML = `
    <div class="hrcek-header">
      <img src="/icon/32.png" alt="" />
      <span class="name">Hrček</span>
    </div>
    <p>Hrček is not configured yet.</p>
    <button id="open-options">Open settings</button>
  `;
  document
    .querySelector<HTMLButtonElement>('#open-options')!
    .addEventListener('click', () => browser.runtime.openOptionsPage());
}
```

`pageUrl` is already a module-level variable set in `main()`; make sure `renderForm` is only ever called after it is assigned, which it already is.

- [ ] **Step 4: Run every test**

```bash
pnpm test
```

Expected: PASS. `form.test.ts` tests `form.ts`, which is untouched, so nothing there should need changing. If a test fails because it queried `#url`, that is an e2e test — fix it in Step 6, not here.

- [ ] **Step 5: Look at it**

```bash
pnpm dev
```

Open the popup on any page. Check: cream background, brown accent, the hamster in the header, the address as a small grey line. Then switch the OS to dark mode and open it again — it should be near-black with a warm accent, with no other change.

- [ ] **Step 6: Fix the e2e selectors this change breaks**

Two selectors have just been deleted, and `tests/e2e/save-flow.spec.ts` asserts on both. Fix them there:

1. **`#url`** — asserted once, in `saves a new entry from the popup`:

   ```ts
   await expect(popup.locator('#url')).toHaveValue('https://example.com/watch');
   ```

   The address is a span now. Replace it with:

   ```ts
   await expect(popup.locator('#address')).toHaveText('https://example.com/watch');
   ```

2. **`#existing-note`** — asserted three times, in `reopening a saved address prefills the existing entry and updates it` (once) and in `a failed initial lookup does not let Save blind-replace an existing entry` (twice). The note is now the pill in the header. Replace every occurrence:

   ```ts
   // was: popup.locator('#existing-note')
   popup.locator('.hrcek-header .aside');
   ```

   keeping each assertion's shape — `toBeVisible()` stays `toBeVisible()`, and `toHaveCount(0)` stays `toHaveCount(0)`.

```bash
pnpm test:e2e
```

Expected: PASS. Nothing else in that file touches markup this task changed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ui/theme.css src/entrypoints/popup
git commit -m "feat: dress the popup in the website's colours"
```

### Task 7: The options page

**Files:**

- Modify: `src/entrypoints/options/style.css`, `src/entrypoints/options/main.ts`

- [ ] **Step 1: Restyle**

Replace `src/entrypoints/options/style.css`:

```css
@import '../../lib/ui/theme.css';

body {
  font-size: 0.9375rem;
}

#app {
  max-width: 34rem;
  margin: 0 auto;
  padding: 2.5rem 1rem;
}

h1 {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0 0 1.5rem;
}

.field {
  margin-bottom: 1rem;
}

details {
  margin-top: 2rem;
}

p {
  font-size: 0.875rem;
  color: var(--muted);
}
```

- [ ] **Step 2: Bring the markup into line**

In `src/entrypoints/options/main.ts`, wrap each `<label>` and its input in `<div class="field">`, add the header, and keep every id exactly as it is — the event wiring below the template depends on them:

```ts
app.innerHTML = `
  <div class="hrcek-header">
    <img src="/icon/32.png" alt="" />
    <span class="name">Hrček</span>
  </div>
  <h1>Settings</h1>
  <form id="settings-form">
    <div class="field">
      <label for="server-url">Server address</label>
      <input id="server-url" type="url" placeholder="https://hrcek.example.com" required />
    </div>
    <div class="field">
      <label for="token">API token</label>
      <input id="token" type="password" placeholder="hrcek_…" autocomplete="off" />
    </div>
    <p>Paste one from <a id="account-link" href="#" target="_blank">your clients page</a>,
       or let Hrček make one below.</p>
    <button type="submit" id="save">Save</button>
    <button type="button" class="quiet" id="test">Test connection</button>
    <p id="status" data-kind="info"></p>
  </form>

  <details id="create-token" open>
    <summary>Create a token with your password</summary>
    <p>Your password is used once to ask Hrček for a token, and is never
       stored. The token appears above and is what the extension uses from
       then on.</p>
    <div class="field">
      <label for="identifier">Email or display name</label>
      <input id="identifier" autocomplete="username" />
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" />
    </div>
    <button type="button" id="create">Create token</button>
  </details>
`;
```

- [ ] **Step 3: Check both themes**

```bash
pnpm dev
```

Open the extension's settings from `about:addons`. Confirm the centred column, and that the details block reads as a panel. Switch the OS theme and reload.

- [ ] **Step 4: Run everything and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/entrypoints/options
git commit -m "feat: dress the settings page to match"
gh stack submit --auto
```

---

# PR 4 — `fields-details`

### Task 8: The field form model

**Files:**

- Create: `src/lib/fields.ts`, `src/lib/fields.test.ts`

**Interfaces:**

- Consumes: `FieldOut` from Task 3.
- Produces:
  - `interface FieldInput { name: string; kind: FieldOut['kind']; options: string[]; value: string }`
  - `buildFieldInputs(definitions: FieldOut[] | null, entryFields: Record<string, string>): FieldInput[]`
  - `fieldsForRequest(inputs: FieldInput[]): Record<string, string>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildFieldInputs, fieldsForRequest } from './fields';
import type { FieldOut } from './api/types';

const DEFINITIONS: FieldOut[] = [
  { name: 'Price', kind: 'number', options: [] },
  { name: 'Priority', kind: 'choice', options: ['high', 'medium', 'low'] },
];

describe('buildFieldInputs', () => {
  it('offers every defined field, with the entry values filled in', () => {
    expect(buildFieldInputs(DEFINITIONS, { Price: '129' })).toEqual([
      { name: 'Price', kind: 'number', options: [], value: '129' },
      { name: 'Priority', kind: 'choice', options: ['high', 'medium', 'low'], value: '' },
    ]);
  });

  it('matches the entry value without regard to case, as the server does', () => {
    const [price] = buildFieldInputs(DEFINITIONS, { price: '129' });
    expect(price!.value).toBe('129');
  });

  it('falls back to the entry’s own keys when the definitions could not be read', () => {
    // The server’s spelling of the name is what came back on the entry,
    // and it is the key to write back.
    expect(buildFieldInputs(null, { Price: '129', Colour: 'red' })).toEqual([
      { name: 'Colour', kind: 'text', options: [], value: 'red' },
      { name: 'Price', kind: 'text', options: [], value: '129' },
    ]);
  });

  it('offers nothing when there are neither definitions nor values', () => {
    expect(buildFieldInputs(null, {})).toEqual([]);
  });
});

describe('fieldsForRequest', () => {
  it('sends every rendered field, clearing the empty ones with an empty string', () => {
    const inputs = buildFieldInputs(DEFINITIONS, { Price: '129' });
    // fields is PATCHED, so a field left out keeps its old value. An
    // emptied input has to say so out loud.
    expect(fieldsForRequest(inputs)).toEqual({ Price: '129', Priority: '' });
  });

  it('never invents a field that was not rendered', () => {
    // A form that guessed at names could clear a value it never showed.
    expect(fieldsForRequest([])).toEqual({});
  });

  it('trims the value but leaves the name as the server spelled it', () => {
    expect(
      fieldsForRequest([{ name: 'Price', kind: 'number', options: [], value: ' 129 ' }]),
    ).toEqual({ Price: '129' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/lib/fields.test.ts
```

Expected: FAIL — `Failed to resolve import "./fields"`.

- [ ] **Step 3: Implement**

Create `src/lib/fields.ts`:

```ts
import type { FieldOut } from './api/types';

/** One row of the form: a definition plus whatever the entry holds for it. */
export interface FieldInput {
  name: string;
  kind: FieldOut['kind'];
  options: string[];
  value: string;
}

function valueFor(entryFields: Record<string, string>, name: string): string {
  // Names match without regard to case, so `price`, `Price` and `PRICE`
  // are the same field — the server says so, and an entry saved by
  // another client may use any spelling.
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(entryFields)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return '';
}

/**
 * The inputs to render. `definitions` is null when GET /api/fields/
 * could not be read; the entry's own keys then stand in, so an existing
 * entry's values stay visible and — more to the point — stay sendable.
 * Guessing at names the form never showed is how values get cleared.
 */
export function buildFieldInputs(
  definitions: FieldOut[] | null,
  entryFields: Record<string, string>,
): FieldInput[] {
  if (definitions !== null) {
    return definitions.map((definition) => ({
      name: definition.name,
      kind: definition.kind,
      options: definition.options,
      value: valueFor(entryFields, definition.name),
    }));
  }
  return Object.keys(entryFields)
    .sort()
    .map((name) => ({
      name,
      // Nothing is known about the kind, so the least presumptuous one.
      kind: 'text' as const,
      options: [],
      value: entryFields[name]!,
    }));
}

/**
 * `fields` is patched, not replaced: names sent are set, names omitted
 * keep what they had. So every rendered field is sent, and an emptied
 * one is sent as "" — that is the documented way to clear a value.
 */
export function fieldsForRequest(inputs: FieldInput[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const input of inputs) fields[input.name] = input.value.trim();
  return fields;
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm vitest run src/lib/fields.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
gh stack add fields-details
git add src/lib/fields.ts src/lib/fields.test.ts
git commit -m "feat: build the field inputs from what the account defined"
```

### Task 9: Render the fields in a `<details>`

**Files:**

- Modify: `src/entrypoints/popup/main.ts`, `src/entrypoints/popup/form.ts`, `src/entrypoints/popup/form.test.ts`, `src/entrypoints/popup/style.css`

**Interfaces:**

- Consumes: `buildFieldInputs`, `fieldsForRequest` from Task 8.
- Produces: `FormState.fields` becomes `FieldInput[]`.

- [ ] **Step 1: Update the form model's test**

In `src/entrypoints/popup/form.test.ts`, replace the cases that build `fields` as `{name, value}` pairs. `FormState.fields` is now `FieldInput[]`, and `formToSaveRequest` delegates to `fieldsForRequest`:

```ts
import { describe, expect, it } from 'vitest';
import { entryToForm, formToSaveRequest, parseTags } from './form';
import type { EntryOut } from '../../lib/api/types';
import type { FieldOut } from '../../lib/api/types';

const DEFINITIONS: FieldOut[] = [
  { name: 'Price', kind: 'number', options: [] },
  { name: 'Priority', kind: 'choice', options: ['high', 'medium', 'low'] },
];

const ENTRY: EntryOut = {
  id: 1,
  url: 'https://example.com/watch',
  title: 'A watch',
  notes: '38mm',
  tags: ['diving', 'watches'],
  fields: { Price: '129' },
  image: null,
  created_at: '2026-09-13T12:28:12.937Z',
  updated_at: '2026-09-13T12:28:12.937Z',
};

describe('entryToForm', () => {
  it('fills the defined fields from the entry and leaves the rest empty', () => {
    const form = entryToForm(ENTRY, DEFINITIONS);
    expect(form.title).toBe('A watch');
    expect(form.fields.map((f) => [f.name, f.value])).toEqual([
      ['Price', '129'],
      ['Priority', ''],
    ]);
  });
});

describe('formToSaveRequest', () => {
  it('sends every rendered field so an emptied one is cleared', () => {
    const form = entryToForm(ENTRY, DEFINITIONS);
    form.fields[0]!.value = '';
    expect(formToSaveRequest(form).fields).toEqual({ Price: '', Priority: '' });
  });
});
```

Keep the file's existing `parseTags` cases as they are.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/entrypoints/popup/form.test.ts
```

Expected: FAIL — `entryToForm` takes one argument.

- [ ] **Step 3: Update the form model**

Rewrite `src/entrypoints/popup/form.ts`:

```ts
import { buildFieldInputs, fieldsForRequest, type FieldInput } from '../../lib/fields';
import type { EntryOut, FieldOut } from '../../lib/api/types';
import type { SaveRequest } from '../../lib/save';

export interface FormState {
  url: string;
  title: string;
  notes: string;
  /** Comma-separated, as typed. */
  tags: string;
  fields: FieldInput[];
}

export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function emptyForm(
  url: string,
  title: string,
  definitions: FieldOut[] | null,
): FormState {
  return { url, title, notes: '', tags: '', fields: buildFieldInputs(definitions, {}) };
}

export function entryToForm(entry: EntryOut, definitions: FieldOut[] | null): FormState {
  return {
    url: entry.url,
    title: entry.title,
    notes: entry.notes,
    tags: entry.tags.join(', '),
    fields: buildFieldInputs(definitions, entry.fields),
  };
}

export function formToSaveRequest(form: FormState): SaveRequest {
  return {
    url: form.url.trim(),
    title: form.title.trim(),
    notes: form.notes,
    tags: parseTags(form.tags),
    fields: fieldsForRequest(form.fields),
  };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm vitest run src/entrypoints/popup/form.test.ts
```

Expected: PASS.

- [ ] **Step 5: Render them**

In `src/entrypoints/popup/main.ts`, replace `fieldRow` with a renderer that respects the kind, and swap the `<div id="fields">` plus "Add field" button for a `<details>`:

```ts
function fieldControl(input: FieldInput): string {
  const id = `field-${encodeURIComponent(input.name)}`;
  if (input.kind === 'choice') {
    const options = ['', ...input.options]
      .map(
        (option) =>
          `<option value="${escapeAttribute(option)}"${option === input.value ? ' selected' : ''}>${
            option === '' ? '—' : escapeText(option)
          }</option>`,
      )
      .join('');
    return `<select id="${id}" data-field="${escapeAttribute(input.name)}">${options}</select>`;
  }
  // A number field still takes a string: values come back as strings
  // always, and the server does the validating.
  const mode = input.kind === 'number' ? ' inputmode="decimal"' : '';
  return `<input id="${id}" data-field="${escapeAttribute(input.name)}"${mode} value="${escapeAttribute(input.value)}" />`;
}

function escapeText(value: string): string {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function fieldsMarkup(inputs: FieldInput[]): string {
  if (inputs.length === 0) return '';
  const rows = inputs
    .map(
      (input) =>
        `<div class="field"><label for="field-${encodeURIComponent(input.name)}">${escapeText(
          input.name,
        )}</label>${fieldControl(input)}</div>`,
    )
    .join('');
  // Closed by default: these are optional, and most saves never touch them.
  return `<details id="fields"><summary>Your fields</summary><div class="field-body">${rows}</div></details>`;
}
```

Use it in `renderForm` in place of `<div id="fields"></div>` and the add-field button:

```ts
      ${fieldsMarkup(form.fields)}
```

and delete the `#add-field` listener along with the loop that appended `fieldRow`s.

- [ ] **Step 6: Read them back**

Replace the `fields` property in `collectForm`:

```ts
    fields: [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]')].map(
      (control) => {
        const rendered = renderedFields.find((field) => field.name === control.dataset['field'])!;
        return { ...rendered, value: control.value };
      },
    ),
```

and hold what was rendered at module level, beside `pageUrl`, so nothing has to be re-derived from the DOM:

```ts
/** What the <details> actually showed. Only these are ever sent back. */
let renderedFields: FieldInput[] = [];
```

setting it at the top of `renderForm`:

```ts
renderedFields = form.fields;
```

- [ ] **Step 7: Load the definitions**

In `main()`, read the definitions before rendering. A failure is not fatal — it downgrades to the entry's own keys:

```ts
// Not fatal: without them the form falls back to the entry's own keys,
// which is enough to show and re-send what the entry already holds.
const definitions = await client.listFields().then(
  (fields) => fields,
  () => null,
);
```

and pass `definitions` to both `entryToForm(existing, definitions)` and `emptyForm(url, title, definitions)` at all three call sites, including the one in `save()`'s re-check.

- [ ] **Step 8: Style the block**

Append to `src/entrypoints/popup/style.css`:

```css
#fields {
  margin-bottom: 0.55rem;
}
#fields .field-body {
  margin-top: 0.5rem;
}
#fields .field:last-child {
  margin-bottom: 0;
}
```

- [ ] **Step 9: Run everything**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: PASS.

- [ ] **Step 10: Replace the e2e test this change makes impossible**

`tests/e2e/save-flow.spec.ts` has a test named `shows the server message for an unknown field`, which clicks `#add-field` and types into `.field-name` / `.field-value`. All three are gone: fields now come from `/api/fields/`, so a name nobody has can no longer be typed, and `HRC-FIELD-0001` is no longer reachable from the popup.

Delete that test and put a positive one in its place — the fields it offers are the account's, and a choice value round-trips:

```ts
test('offers the account’s own fields and saves a choice', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const popup = await openPopup(context, extensionId, 'https://example.com/x', 'X');

  // Built from GET /api/fields/, never hard-coded on the client side.
  await popup.locator('#fields').click();
  await expect(popup.locator('[data-field="Price"]')).toBeVisible();
  await popup.locator('[data-field="Price"]').fill('129');
  await popup.locator('[data-field="Priority"]').selectOption('high');
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Saved.');

  const reopened = await openPopup(context, extensionId, 'https://example.com/x', 'X');
  await reopened.locator('#fields').click();
  await expect(reopened.locator('[data-field="Price"]')).toHaveValue('129');
  await expect(reopened.locator('[data-field="Priority"]')).toHaveValue('high');
});
```

Then check the whole suite:

```bash
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 11: Look at it**

```bash
pnpm dev
```

The popup should show a closed "Your fields" panel. Open it: Price as a text input, Priority as a select starting at `—`. Save with Priority set, reopen, and confirm it comes back selected.

- [ ] **Step 12: Commit**

```bash
git add src/entrypoints/popup src/lib/fields.ts
git commit -m "feat: fold the account's own fields into a details panel"
gh stack submit --auto
```

---

# PR 5 — `tag-chips`

### Task 10: The chip model

**Files:**

- Create: `src/lib/tags.ts`, `src/lib/tags.test.ts`

**Interfaces:**

- Produces:
  - `normalizeTag(raw: string): string` — trimmed
  - `sameTag(a: string, b: string): boolean` — case-insensitive
  - `addTag(tags: string[], raw: string): string[]`
  - `removeTag(tags: string[], raw: string): string[]`
  - `suggestionsFor(labels: string[], tags: string[]): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/tags.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addTag, normalizeTag, removeTag, sameTag, suggestionsFor } from './tags';

describe('normalizeTag', () => {
  it('trims, and nothing else', () => {
    expect(normalizeTag('  watches  ')).toBe('watches');
    // Capitals are the owner's business; only the comparison ignores them.
    expect(normalizeTag('Watches')).toBe('Watches');
  });
});

describe('sameTag', () => {
  it('ignores capitals, because the server cannot hold two that differ only so', () => {
    expect(sameTag('Watches', 'watches')).toBe(true);
    expect(sameTag('watches', 'water')).toBe(false);
  });
});

describe('addTag', () => {
  it('appends a tag', () => {
    expect(addTag(['diving'], 'watches')).toEqual(['diving', 'watches']);
  });

  it('refuses a duplicate whatever its capitals', () => {
    expect(addTag(['Watches'], 'watches')).toEqual(['Watches']);
  });

  it('refuses blank input', () => {
    expect(addTag(['diving'], '   ')).toEqual(['diving']);
  });
});

describe('removeTag', () => {
  it('removes by name, ignoring capitals', () => {
    expect(removeTag(['Watches', 'diving'], 'watches')).toEqual(['diving']);
  });
});

describe('suggestionsFor', () => {
  it('never offers a tag the entry already carries', () => {
    // The duplicate is prevented by not offering it, rather than by
    // rejecting it after the fact.
    expect(suggestionsFor(['watches', 'water'], ['Watches'])).toEqual(['water']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/lib/tags.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/tags.ts`:

```ts
/** Trimmed, and nothing else — the capitals somebody typed are theirs. */
export function normalizeTag(raw: string): string {
  return raw.trim();
}

/**
 * Labels cannot differ from one another only by case — the server's
 * unique constraint sees to that — so comparing any other way would let
 * a duplicate through.
 */
export function sameTag(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function addTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (tag.length === 0) return tags;
  if (tags.some((existing) => sameTag(existing, tag))) return tags;
  return [...tags, tag];
}

export function removeTag(tags: string[], raw: string): string[] {
  return tags.filter((existing) => !sameTag(existing, raw));
}

/** What the autocomplete may offer: everything not already carried. */
export function suggestionsFor(labels: string[], tags: string[]): string[] {
  return labels.filter((label) => !tags.some((tag) => sameTag(tag, label)));
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm vitest run src/lib/tags.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
gh stack add tag-chips
git add src/lib/tags.ts src/lib/tags.test.ts
git commit -m "feat: model tags as a set that ignores capitals"
```

### Task 11: The chip input

**Files:**

- Create: `src/entrypoints/popup/chips.ts`, `src/entrypoints/popup/chips.test.ts`
- Modify: `src/entrypoints/popup/main.ts`, `src/entrypoints/popup/form.ts`, `src/entrypoints/popup/style.css`

**Interfaces:**

- Consumes: `addTag`, `removeTag`, `suggestionsFor` from Task 10; `listLabels` from Task 4.
- Produces: `createChipInput(host: HTMLElement, options: ChipOptions): ChipInput` where

```ts
interface ChipOptions {
  tags: string[];
  suggest(prefix: string): Promise<string[]>;
  onSubmit(): void;
}
interface ChipInput {
  tags(): string[];
}
```

- [ ] **Step 1: Write the failing test**

Create `src/entrypoints/popup/chips.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createChipInput } from './chips';

function mount(tags: string[] = [], suggest = async () => [] as string[]) {
  const host = document.createElement('div');
  document.body.append(host);
  const onSubmit = vi.fn();
  const chips = createChipInput(host, { tags, suggest, onSubmit });
  const input = host.querySelector('input')!;
  return { host, chips, input, onSubmit };
}

function press(input: HTMLInputElement, key: string): void {
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

describe('createChipInput', () => {
  it('commits what was typed when a comma is pressed', () => {
    const { chips, input } = mount();
    input.value = 'watches';
    press(input, ',');
    expect(chips.tags()).toEqual(['watches']);
    expect(input.value).toBe('');
  });

  it('commits what was typed on the right arrow', () => {
    const { chips, input } = mount();
    input.value = 'diving';
    press(input, 'ArrowRight');
    expect(chips.tags()).toEqual(['diving']);
  });

  it('leaves the right arrow alone when the caret is mid-word', () => {
    // Otherwise moving the caret would commit half a tag.
    const { chips, input } = mount();
    input.value = 'diving';
    input.setSelectionRange(2, 2);
    press(input, 'ArrowRight');
    expect(chips.tags()).toEqual([]);
  });

  it('submits on Enter when there is nothing to commit', () => {
    const { input, onSubmit } = mount();
    press(input, 'Enter');
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('commits what was typed and then submits on Enter', () => {
    // Submitting while silently dropping what somebody just typed is the
    // wrong trade.
    const { chips, input, onSubmit } = mount();
    input.value = 'watches';
    press(input, 'Enter');
    expect(chips.tags()).toEqual(['watches']);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('removes the last chip on backspace in an empty input', () => {
    const { chips, input } = mount(['diving', 'watches']);
    press(input, 'Backspace');
    expect(chips.tags()).toEqual(['diving']);
  });

  it('keeps the chip when backspace has text to delete instead', () => {
    const { chips, input } = mount(['diving']);
    input.value = 'wa';
    press(input, 'Backspace');
    expect(chips.tags()).toEqual(['diving']);
  });

  it('removes a chip when its × is clicked', () => {
    const { host, chips } = mount(['diving', 'watches']);
    host.querySelectorAll<HTMLButtonElement>('.chip button')[0]!.click();
    expect(chips.tags()).toEqual(['watches']);
  });

  it('takes the highlighted suggestion on Enter, and does not submit', async () => {
    const suggest = async () => ['waterproofing', 'watch-straps'];
    const { chips, input, onSubmit } = mount([], suggest);
    input.value = 'wat';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelectorAll('.suggestion').length).toBe(2),
    );

    press(input, 'ArrowDown');
    press(input, 'Enter');
    expect(chips.tags()).toEqual(['waterproofing']);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/entrypoints/popup/chips.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/entrypoints/popup/chips.ts`:

```ts
import { addTag, normalizeTag, removeTag, suggestionsFor } from '../../lib/tags';

export interface ChipOptions {
  tags: string[];
  /** Answers the labels beginning with `prefix`; may reject, and then offers none. */
  suggest(prefix: string): Promise<string[]>;
  onSubmit(): void;
}

export interface ChipInput {
  tags(): string[];
}

/** As long as a lookup can take before typing starts to feel watched. */
const SUGGEST_DELAY_MS = 200;

export function createChipInput(host: HTMLElement, options: ChipOptions): ChipInput {
  let tags = [...options.tags];
  let suggestions: string[] = [];
  let highlighted = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Rising counter, so a slow answer cannot overwrite a newer one. */
  let generation = 0;

  host.className = 'chips-host';
  host.innerHTML = `
    <div class="chips"><input class="chip-input" placeholder="Add a tag" autocomplete="off" /></div>
    <div class="suggestions" hidden></div>
  `;
  const box = host.querySelector<HTMLDivElement>('.chips')!;
  const input = host.querySelector<HTMLInputElement>('.chip-input')!;
  const menu = host.querySelector<HTMLDivElement>('.suggestions')!;

  function renderChips(): void {
    for (const chip of box.querySelectorAll('.chip')) chip.remove();
    for (const tag of tags) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = tag;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${tag}`);
      remove.addEventListener('click', () => {
        tags = removeTag(tags, tag);
        renderChips();
        input.focus();
      });
      chip.append(remove);
      box.insertBefore(chip, input);
    }
  }

  function renderSuggestions(): void {
    menu.innerHTML = '';
    menu.hidden = suggestions.length === 0;
    suggestions.forEach((name, index) => {
      const row = document.createElement('div');
      row.className = index === highlighted ? 'suggestion on' : 'suggestion';
      row.textContent = name;
      row.addEventListener('mousedown', (event) => {
        // mousedown, not click: the input must not lose focus first.
        event.preventDefault();
        commit(name);
      });
      menu.append(row);
    });
  }

  function clearSuggestions(): void {
    suggestions = [];
    highlighted = -1;
    renderSuggestions();
  }

  function commit(raw: string): boolean {
    const before = tags.length;
    tags = addTag(tags, raw);
    input.value = '';
    clearSuggestions();
    renderChips();
    return tags.length > before;
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const prefix = normalizeTag(input.value);
    if (prefix.length === 0) {
      clearSuggestions();
      return;
    }
    const mine = ++generation;
    timer = setTimeout(() => {
      void options.suggest(prefix).then(
        (labels) => {
          if (mine !== generation) return;
          // Never offer one the entry already carries: the duplicate is
          // prevented by absence rather than by a refusal afterwards.
          suggestions = suggestionsFor(labels, tags);
          highlighted = -1;
          renderSuggestions();
        },
        () => {
          // Suggestions are a convenience. Typing still works without them.
          if (mine === generation) clearSuggestions();
        },
      );
    }, SUGGEST_DELAY_MS);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlighted = (highlighted + step + suggestions.length) % suggestions.length;
      renderSuggestions();
      return;
    }

    if (event.key === 'Escape') {
      clearSuggestions();
      return;
    }

    if (event.key === ',') {
      event.preventDefault();
      commit(input.value);
      return;
    }

    if (event.key === 'ArrowRight') {
      // Only at the very end, or moving the caret would commit half a tag.
      const atEnd =
        input.selectionStart === input.value.length &&
        input.selectionStart === input.selectionEnd;
      if (!atEnd || input.value.length === 0) return;
      event.preventDefault();
      commit(input.value);
      return;
    }

    if (event.key === 'Backspace') {
      if (input.value.length > 0 || tags.length === 0) return;
      event.preventDefault();
      tags = tags.slice(0, -1);
      renderChips();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (highlighted >= 0) {
        // Taking a suggestion is the whole gesture; it does not also save.
        commit(suggestions[highlighted]!);
        return;
      }
      // Anything typed but not committed is kept before submitting —
      // submitting and dropping it silently is the wrong trade.
      if (normalizeTag(input.value).length > 0) commit(input.value);
      options.onSubmit();
    }
  });

  input.addEventListener('blur', () => {
    // Leaving the field is as good as a comma: what was typed is meant.
    if (normalizeTag(input.value).length > 0) commit(input.value);
    clearSuggestions();
  });

  renderChips();
  return { tags: () => [...tags] };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm vitest run src/entrypoints/popup/chips.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Use it in the popup**

In `src/entrypoints/popup/main.ts`, replace the tags input in `renderForm`'s template:

```ts
      <div class="field"><label>Tags</label><div id="tags"></div></div>
```

and after the template is assigned, mount it, holding the handle at module level beside `renderedFields`:

```ts
let chips: ChipInput | null = null;
```

```ts
chips = createChipInput(document.querySelector<HTMLDivElement>('#tags')!, {
  tags: parseTags(form.tags),
  suggest: (prefix) =>
    client === null
      ? Promise.resolve([])
      : client
          .listLabels({ startsWith: prefix })
          .then((labels) => labels.map((label) => label.name)),
  onSubmit: () => void save(),
});
```

Then read them back in `collectForm`:

```ts
    tags: (chips?.tags() ?? []).join(', '),
```

`FormState.tags` stays a comma-joined string so `formToSaveRequest` and `parseTags` are untouched — the chips are a different way of typing the same thing.

- [ ] **Step 6: Style the chips**

Append to `src/entrypoints/popup/style.css`:

```css
.chips-host {
  position: relative;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  padding: 0.25rem 0.3rem;
}
.chips:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.72rem;
  border: 1px solid var(--edge);
  border-radius: 99px;
  padding: 0.05rem 0.2rem 0.05rem 0.45rem;
}
.chip button {
  background: none;
  border: 0;
  padding: 0 0.15rem;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
}
.chip button:hover {
  background: none;
  color: var(--danger);
}
.chip-input {
  flex: 1;
  min-width: 5rem;
  border: 0 !important;
  background: none !important;
  padding: 0.15rem !important;
}
.chip-input:focus-visible {
  outline: none;
}
.suggestions {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  margin-top: 0.15rem;
  background: var(--raised);
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  overflow: hidden;
  font-size: 0.78rem;
}
.suggestion {
  padding: 0.25rem 0.5rem;
  cursor: pointer;
}
.suggestion.on,
.suggestion:hover {
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  font-weight: 600;
}
```

- [ ] **Step 7: Run everything**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: PASS.

- [ ] **Step 8: Fix the e2e tests that type into `#tags`**

`#tags` is a host div now, not an input, so `popup.fill('#tags', …)` fails. It is used once, in `saves a new entry from the popup`:

```ts
await popup.fill('#tags', 'watches, diving');
```

Replace it with typing into the chip input, committing each with a comma — which is also the first end-to-end proof that the comma key works:

```ts
await popup.locator('.chip-input').fill('watches');
await popup.locator('.chip-input').press(',');
await popup.locator('.chip-input').fill('diving');
await popup.locator('.chip-input').press(',');
await expect(popup.locator('.chip')).toHaveCount(2);
```

Note that `reopening a saved address …` fills `#notes` and `#title` only, so it is unaffected.

```bash
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 9: Try it by hand**

```bash
pnpm dev
```

Save an entry with two tags. Open the popup on another page, type a prefix of one of them, and check: the suggestion appears, ↓ then ↵ takes it without saving, a comma commits free text, `→` at the end of the word commits, ↵ on an empty input saves, and a tag already on the entry is never offered twice.

- [ ] **Step 10: Commit**

```bash
git add src/entrypoints/popup
git commit -m "feat: type tags as chips, with the account's labels offered"
gh stack submit --auto
```

---

# PR 6 — `entry-updates`

### Task 12: Send back what the API expects

**Files:**

- Modify: `src/lib/save.ts`, `src/lib/save.test.ts`

**Interfaces:**

- Consumes: `FieldInput` from Task 8.
- Produces: `SaveRequest` gains `imageUrl?: string | null`, and `submitSave` honours the omission rule.

- [ ] **Step 1: Write the failing test**

`src/lib/save.test.ts` already has a `describe('submitSave', …)` block with one case, an `ENTRY` fixture, and the house stub style — `const client = { saveEntry } as unknown as HrcekClient`. Add three cases inside that existing block, in the same style:

```ts
it('omits image_url entirely when the picture did not change', async () => {
  // Leaving image_url out is documented as changing nothing; sending
  // null or "" is not the same thing at all.
  const saveEntry = vi.fn().mockResolvedValue({ status: 'updated', entry: ENTRY });
  const client = { saveEntry } as unknown as HrcekClient;

  await submitSave(client, {
    url: 'https://example.com/watch',
    title: '',
    notes: '',
    tags: [],
    fields: {},
  });

  expect('image_url' in saveEntry.mock.calls[0]![0]).toBe(false);
});

it('sends image_url when an address was chosen and the bytes could not be read', async () => {
  const saveEntry = vi.fn().mockResolvedValue({ status: 'updated', entry: ENTRY });
  const client = { saveEntry } as unknown as HrcekClient;

  await submitSave(client, {
    url: 'https://example.com/watch',
    title: '',
    notes: '',
    tags: [],
    fields: {},
    imageUrl: 'https://cdn.example.com/watch.jpg',
  });

  expect(saveEntry.mock.calls[0]![0].image_url).toBe('https://cdn.example.com/watch.jpg');
});

it('sends title, notes and tags in full, because POST replaces', async () => {
  // A partial send silently clears whatever it left out.
  const saveEntry = vi.fn().mockResolvedValue({ status: 'updated', entry: ENTRY });
  const client = { saveEntry } as unknown as HrcekClient;

  await submitSave(client, {
    url: 'https://example.com/watch',
    title: 'A watch, revisited',
    notes: '38mm',
    tags: ['diving'],
    fields: { Price: '129' },
  });

  expect(saveEntry).toHaveBeenCalledWith({
    url: 'https://example.com/watch',
    title: 'A watch, revisited',
    notes: '38mm',
    tags: ['diving'],
    fields: { Price: '129' },
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/lib/save.test.ts
```

Expected: FAIL — `imageUrl` is not on `SaveRequest`.

- [ ] **Step 3: Implement**

Rewrite the request half of `src/lib/save.ts`:

```ts
export interface SaveRequest {
  url: string;
  title: string;
  notes: string;
  tags: string[];
  /**
   * Every field the form rendered, empty ones as "" to clear them.
   * `fields` is patched, not replaced, so anything omitted keeps its old
   * value — which is why nothing the form did not show may appear here.
   */
  fields: Record<string, string>;
  /**
   * An address for the server to fetch, when the bytes could not be read
   * here. Left undefined the attribute is not sent at all, and the entry
   * keeps whatever picture it had — omission is the documented no-op.
   */
  imageUrl?: string;
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
    // title, notes and tags always go in full: POST replaces, so a
    // partial send silently clears whatever it left out.
    url: request.url,
    title: request.title,
    notes: request.notes,
    tags: request.tags,
    fields: request.fields,
    ...(request.imageUrl === undefined ? {} : { image_url: request.imageUrl }),
  });
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm vitest run src/lib/save.test.ts
```

Expected: PASS.

- [ ] **Step 5: Extend the fake to honour the rule**

In `tests/fake-hrcek/server.ts`, teach `POST /api/entries/` about `image_url`. Add `image_url?: string` to the body type, and replace the `image:` line of the constructed entry:

```ts
          // Like fields, and unlike every other attribute, an absent
          // image_url changes nothing — a client that predates pictures
          // cannot strip one by saving an entry.
          image:
            typeof body.image_url === 'string' && body.image_url.length > 0
              ? { url: `/entries/${existing?.id ?? nextId}/image/`, width: 1200, height: 630 }
              : (existing?.image ?? null),
```

- [ ] **Step 6: Add a fake test for it**

Append to `tests/fake-hrcek/server.test.ts`, using its existing `post(body)` helper:

```ts
it('leaves a picture alone when image_url is omitted', async () => {
  await post({
    url: 'https://example.com/pic',
    image_url: 'https://cdn.example.com/a.jpg',
  });

  // Like fields, and unlike every other attribute, an absent image_url
  // changes nothing — a client that predates pictures cannot strip one.
  const again = await post({ url: 'https://example.com/pic', title: 'Renamed' });

  const entry = await again.json();
  expect(entry.title).toBe('Renamed');
  expect(entry.image).not.toBeNull();
});
```

- [ ] **Step 7: Run everything and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
gh stack add entry-updates
git add src/lib/save.ts src/lib/save.test.ts tests/fake-hrcek
git commit -m "feat: send back an entry without clearing what it holds"
gh stack submit --auto
```

---

# PR 7 — `picture`

### Task 13: Ranking the page's images

**Files:**

- Create: `src/lib/page/candidates.ts`, `src/lib/page/candidates.test.ts`

**Interfaces:**

- Produces:
  - `interface RawCandidate { url: string; width: number; height: number; fromHead: boolean }`
  - `interface Candidate { url: string; width: number; height: number; fromHead: boolean }`
  - `rankCandidates(raw: RawCandidate[]): Candidate[]`
  - `const MAX_CANDIDATES = 60`, `const MIN_DIMENSION = 100`

- [ ] **Step 1: Write the failing test**

Create `src/lib/page/candidates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_CANDIDATES, rankCandidates } from './candidates';

function img(url: string, width = 600, height = 400) {
  return { url, width, height, fromHead: false };
}
function head(url: string) {
  return { url, width: 0, height: 0, fromHead: true };
}

describe('rankCandidates', () => {
  it('puts what the head declared first, whatever its size', () => {
    // A page that says which picture represents it has answered the
    // question; a bigger photo further down has not.
    expect(
      rankCandidates([
        img('https://e.test/big.jpg', 2000, 2000),
        head('https://e.test/og.jpg'),
      ]).map((c) => c.url),
    ).toEqual(['https://e.test/og.jpg', 'https://e.test/big.jpg']);
  });

  it('keeps head candidates in the order they were declared', () => {
    expect(
      rankCandidates([head('https://e.test/og.jpg'), head('https://e.test/tw.jpg')]).map(
        (c) => c.url,
      ),
    ).toEqual(['https://e.test/og.jpg', 'https://e.test/tw.jpg']);
  });

  it('sorts the document images biggest first', () => {
    expect(
      rankCandidates([
        img('https://e.test/s.jpg', 200, 200),
        img('https://e.test/l.jpg', 800, 800),
      ]).map((c) => c.url),
    ).toEqual(['https://e.test/l.jpg', 'https://e.test/s.jpg']);
  });

  it('drops images too small to be worth saving', () => {
    expect(rankCandidates([img('https://e.test/icon.png', 32, 32)])).toEqual([]);
  });

  it('never drops a head candidate for being small — its size is unknown', () => {
    expect(rankCandidates([head('https://e.test/og.jpg')])).toHaveLength(1);
  });

  it('drops SVG, which the server refuses outright', () => {
    // It is a document that can carry script.
    expect(
      rankCandidates([img('https://e.test/logo.svg'), head('https://e.test/h.svg')]),
    ).toEqual([]);
  });

  it('de-duplicates, keeping the earlier — and so the head — entry', () => {
    const ranked = rankCandidates([
      head('https://e.test/a.jpg'),
      img('https://e.test/a.jpg', 900, 900),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.fromHead).toBe(true);
  });

  it('drops anything that is not an http address', () => {
    expect(
      rankCandidates([img('data:image/png;base64,iVBORw0KGgo='), img('about:blank')]),
    ).toEqual([]);
  });

  it('caps the list, so the message back from the page stays small', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      img(`https://e.test/${i}.jpg`, 500 + i, 500),
    );
    expect(rankCandidates(many)).toHaveLength(MAX_CANDIDATES);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/lib/page/candidates.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/page/candidates.ts`:

```ts
/** One image the page offered, before any ranking. */
export interface RawCandidate {
  url: string;
  /** 0 when unknown — head declarations carry no size. */
  width: number;
  height: number;
  fromHead: boolean;
}

export type Candidate = RawCandidate;

/** Below this in either direction it is furniture, not a picture. */
export const MIN_DIMENSION = 100;

/** Enough to choose from; small enough to pass in one message. */
export const MAX_CANDIDATES = 60;

function isFetchable(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // SVG is refused by the server outright — it is a document that can
    // carry script — so offering one would only waste a choice.
    return !/\.svgz?($|[?#])/i.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

/**
 * Head declarations first, in the order the page made them, then the
 * document's images largest first. A page that names its own picture has
 * answered the question; size is only the tie-breaker for the rest.
 */
export function rankCandidates(raw: RawCandidate[]): Candidate[] {
  const seen = new Set<string>();
  const head: Candidate[] = [];
  const body: Candidate[] = [];

  for (const candidate of raw) {
    if (!isFetchable(candidate.url)) continue;
    if (seen.has(candidate.url)) continue;
    // A head candidate's size is unknown, not small, so the floor does
    // not apply to it.
    if (
      !candidate.fromHead &&
      (candidate.width < MIN_DIMENSION || candidate.height < MIN_DIMENSION)
    ) {
      continue;
    }
    seen.add(candidate.url);
    (candidate.fromHead ? head : body).push(candidate);
  }

  body.sort((a, b) => b.width * b.height - a.width * a.height);
  return [...head, ...body].slice(0, MAX_CANDIDATES);
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm vitest run src/lib/page/candidates.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
gh stack add picture
git add src/lib/page
git commit -m "feat: rank the pictures a page offers"
```

### Task 14: Read them out of the page

**Files:**

- Create: `src/entrypoints/harvest.ts`
- Create: `src/lib/platform/inject.ts`
- Create: `src/lib/page/harvest-client.ts`
- Modify: `wxt.config.ts`

**Interfaces:**

- Consumes: `RawCandidate`, `rankCandidates` from Task 13.
- Produces: `harvestCandidates(tabId: number): Promise<Candidate[]>` from `src/lib/page/harvest-client.ts` — answers `[]` on any failure, because a page that cannot be read simply offers no picture.

- [ ] **Step 1: Add the MV3 permission**

In `wxt.config.ts`, add to the `permissions` array:

```ts
      // MV3 needs this to inject at all. MV2 reaches the same thing
      // through tabs.executeScript, which activeTab already covers.
      ...(manifestVersion === 3 ? ['scripting'] : []),
```

- [ ] **Step 2: Write the page-side script**

Create `src/entrypoints/harvest.ts`:

```ts
import type { RawCandidate } from '../lib/page/candidates';

/**
 * Reads the pictures this page offers. Injected on demand when the popup
 * opens, under activeTab — not registered, because the extension has no
 * business running on every page you load.
 *
 * It answers a message rather than a return value: MV2 and MV3 disagree
 * about what an injected file's result is, and a message is the same on
 * both.
 */
const HEAD_SELECTORS = [
  'meta[property="og:image"]',
  'meta[property="og:image:secure_url"]',
  'meta[name="twitter:image"]',
  'meta[name="twitter:image:src"]',
  'link[rel="image_src"]',
  'meta[itemprop="image"]',
];

function absolute(raw: string | null): string | null {
  if (raw === null || raw.trim().length === 0) return null;
  try {
    return new URL(raw, document.baseURI).href;
  } catch {
    return null;
  }
}

function collect(): RawCandidate[] {
  const found: RawCandidate[] = [];

  for (const selector of HEAD_SELECTORS) {
    for (const node of document.querySelectorAll(selector)) {
      const url = absolute(node.getAttribute('content') ?? node.getAttribute('href'));
      // Size is unknown here, and the ranking knows not to hold that
      // against a head declaration.
      if (url !== null) found.push({ url, width: 0, height: 0, fromHead: true });
    }
  }

  for (const image of document.images) {
    // currentSrc, so srcset and <picture> give what is actually shown.
    const url = absolute(image.currentSrc || image.src);
    if (url === null) continue;
    // naturalWidth is 0 for an image that has not loaded — a lazy one
    // below the fold — so the rendered box stands in.
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    found.push({ url, width, height, fromHead: false });
  }

  return found;
}

export default defineUnlistedScript(() => {
  const flag = '__hrcekHarvestReady';
  const scope = window as unknown as Record<string, unknown>;
  // Injected once per popup opening; a second injection must not add a
  // second listener, or every answer would arrive twice.
  if (scope[flag] === true) return;
  scope[flag] = true;

  browser.runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: string }).type !== 'hrcek:harvest') return undefined;
    return Promise.resolve({ candidates: collect() });
  });
});
```

- [ ] **Step 3: Write the platform module**

Create `src/lib/platform/inject.ts`:

```ts
import { browser } from 'wxt/browser';

/**
 * Runs a file in a tab. MV3 has scripting.executeScript, MV2 has
 * tabs.executeScript, and the two do not share a signature — rung three
 * of the browser ladder, because no build-time switch can bridge them.
 */
export async function injectFile(tabId: number, file: string): Promise<void> {
  const api = browser as unknown as {
    scripting?: { executeScript(details: unknown): Promise<unknown> };
    tabs: { executeScript(tabId: number, details: unknown): Promise<unknown> };
  };
  if (api.scripting !== undefined) {
    await api.scripting.executeScript({ target: { tabId }, files: [file] });
    return;
  }
  await api.tabs.executeScript(tabId, { file: `/${file}` });
}
```

- [ ] **Step 4: Write the extension-side caller**

Create `src/lib/page/harvest-client.ts`:

```ts
import { browser } from 'wxt/browser';
import { injectFile } from '../platform/inject';
import { rankCandidates, type Candidate, type RawCandidate } from './candidates';

/**
 * What this page offers, ranked. Any failure answers an empty list: a
 * page that cannot be read — a PDF, a privileged page, a tab that closed
 * — simply offers no picture, and that is not an error worth showing.
 */
export async function harvestCandidates(tabId: number): Promise<Candidate[]> {
  try {
    await injectFile(tabId, 'harvest.js');
    const reply = (await browser.tabs.sendMessage(tabId, { type: 'hrcek:harvest' })) as
      { candidates?: RawCandidate[] } | undefined;
    return rankCandidates(reply?.candidates ?? []);
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Confirm the script is built**

```bash
pnpm build && ls .output/firefox-mv2/harvest.js
pnpm build:chrome && grep -o '"scripting"' .output/chrome-mv3/manifest.json
```

Expected: the file exists in the Firefox build, and `"scripting"` appears once in the Chrome manifest. Check that `.output/firefox-mv2/manifest.json` does **not** contain `scripting`.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/entrypoints/harvest.ts src/lib/platform/inject.ts src/lib/page/harvest-client.ts wxt.config.ts
git commit -m "feat: read the pictures a page offers, on demand"
```

### Task 15: Bytes, address, or delete

**Files:**

- Create: `src/lib/picture.ts`, `src/lib/picture.test.ts`
- Modify: `src/lib/api/client.ts`, `src/lib/api/client.test.ts`
- Modify: `tests/fake-hrcek/server.ts`

**Interfaces:**

- Consumes: `submitSave` from Task 12.
- Produces:
  - `HrcekClient.uploadImage(id: number, bytes: Blob, filename: string): Promise<EntryOut>`
  - `HrcekClient.deleteImage(id: number): Promise<void>`
  - `type PictureChoice = { kind: 'unchanged' } | { kind: 'none' } | { kind: 'url'; url: string }`
  - `fetchPictureBytes(url: string, fetchFn?: typeof fetch): Promise<Blob | null>`
  - `attachPicture(client, entry, choice, bytes): Promise<string | null>` — answers a message to show when the picture failed, or null when all was well.
  - `const MAX_PICTURE_BYTES = 10 * 1024 * 1024`

- [ ] **Step 1: Write the client's failing tests**

Append to `src/lib/api/client.test.ts` inside `describe('HrcekClient', …)`:

```ts
it('uploadImage() sends multipart, not JSON, and lets fetch set the boundary', async () => {
  server.use(
    http.post(`${BASE}/api/entries/1/image`, async ({ request }) => {
      // base64 would inflate every upload by a third for nothing.
      expect(request.headers.get('Content-Type')).toMatch(
        /^multipart\/form-data; boundary=/,
      );
      const form = await request.formData();
      expect((form.get('file') as File).name).toBe('picture.jpg');
      return HttpResponse.json({
        ...ENTRY,
        image: { url: '/entries/1/image/', width: 12, height: 8 },
      });
    }),
  );

  const entry = await client().uploadImage(
    1,
    new Blob(['xx'], { type: 'image/jpeg' }),
    'picture.jpg',
  );
  expect(entry.image).not.toBeNull();
});

it('deleteImage() accepts the 204 that has no body', async () => {
  server.use(
    http.delete(
      `${BASE}/api/entries/1/image`,
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
  await expect(client().deleteImage(1)).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm vitest run src/lib/api/client.test.ts
```

Expected: FAIL — `uploadImage is not a function`.

- [ ] **Step 3: Implement them**

In `src/lib/api/client.ts`, make `request` leave `FormData` alone. Replace the `headers` construction:

```ts
const isForm = body instanceof FormData;
const headers: Record<string, string> = {
  Accept: 'application/json',
  // FormData sets its own Content-Type, boundary and all. Setting it
  // by hand produces a body the server cannot parse.
  ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
  ...(authenticated ? { Authorization: `Bearer ${this.token}` } : {}),
};
```

and the body:

```ts
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
```

Then add the two methods after `saveEntry`:

```ts
  /** Replaces whatever picture the entry had. Multipart, not JSON. */
  async uploadImage(id: number, bytes: Blob, filename: string): Promise<EntryOut> {
    const form = new FormData();
    form.set('file', bytes, filename);
    return (await this.request('POST', `/api/entries/${id}/image`, form)).json();
  }

  /** The only way to remove a picture; a POST cannot do it. 204, no body. */
  async deleteImage(id: number): Promise<void> {
    await this.request('DELETE', `/api/entries/${id}/image`);
  }
```

- [ ] **Step 4: Run them**

```bash
pnpm vitest run src/lib/api/client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the decision module's failing test**

Create `src/lib/picture.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { attachPicture, fetchPictureBytes, MAX_PICTURE_BYTES } from './picture';
import type { EntryOut } from './api/types';

const ENTRY: EntryOut = {
  id: 7,
  url: 'https://example.com/watch',
  title: '',
  notes: '',
  tags: [],
  fields: {},
  image: null,
  created_at: '2026-09-13T12:28:12.937Z',
  updated_at: '2026-09-13T12:28:12.937Z',
};

function blob(size: number, type = 'image/jpeg') {
  return new Blob([new Uint8Array(size)], { type });
}

describe('fetchPictureBytes', () => {
  it('answers the bytes when the origin is reachable', async () => {
    const fetchFn = vi.fn(async () => new Response(blob(64))) as unknown as typeof fetch;
    const bytes = await fetchPictureBytes('https://cdn.test/a.jpg', fetchFn);
    expect(bytes?.size).toBe(64);
  });

  it('answers null when the origin refuses, so the address can stand in', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('blocked');
    }) as unknown as typeof fetch;
    expect(await fetchPictureBytes('https://cdn.test/a.jpg', fetchFn)).toBeNull();
  });

  it('answers null for something too large to upload', async () => {
    const fetchFn = vi.fn(
      async () => new Response(blob(MAX_PICTURE_BYTES + 1)),
    ) as unknown as typeof fetch;
    // Falls through to image_url rather than failing the save.
    expect(await fetchPictureBytes('https://cdn.test/huge.jpg', fetchFn)).toBeNull();
  });

  it('answers null for an SVG, which the server refuses', async () => {
    const fetchFn = vi.fn(
      async () => new Response(blob(64, 'image/svg+xml')),
    ) as unknown as typeof fetch;
    expect(await fetchPictureBytes('https://cdn.test/a.svg', fetchFn)).toBeNull();
  });
});

describe('attachPicture', () => {
  it('does nothing at all when the picture did not change', async () => {
    const client = { uploadImage: vi.fn(), deleteImage: vi.fn() };
    expect(
      await attachPicture(client as never, ENTRY, { kind: 'unchanged' }, null),
    ).toBeNull();
    expect(client.uploadImage).not.toHaveBeenCalled();
    expect(client.deleteImage).not.toHaveBeenCalled();
  });

  it('uploads the bytes when there are any', async () => {
    const client = { uploadImage: vi.fn(async () => ENTRY), deleteImage: vi.fn() };
    const bytes = blob(32);
    expect(
      await attachPicture(
        client as never,
        ENTRY,
        { kind: 'url', url: 'https://cdn.test/a.jpg' },
        bytes,
      ),
    ).toBeNull();
    expect(client.uploadImage).toHaveBeenCalledWith(7, bytes, 'a.jpg');
  });

  it('leaves the server to fetch the address when there are no bytes', async () => {
    // The entry POST already carried image_url in that case, so there is
    // nothing left to do here.
    const client = { uploadImage: vi.fn(), deleteImage: vi.fn() };
    expect(
      await attachPicture(
        client as never,
        ENTRY,
        { kind: 'url', url: 'https://cdn.test/a.jpg' },
        null,
      ),
    ).toBeNull();
    expect(client.uploadImage).not.toHaveBeenCalled();
  });

  it('deletes the picture when none was chosen and the entry had one', async () => {
    const client = { uploadImage: vi.fn(), deleteImage: vi.fn(async () => undefined) };
    const held = { ...ENTRY, image: { url: '/entries/7/image/', width: 12, height: 8 } };
    expect(await attachPicture(client as never, held, { kind: 'none' }, null)).toBeNull();
    expect(client.deleteImage).toHaveBeenCalledWith(7);
  });

  it('does not delete when there was nothing to delete', async () => {
    const client = { uploadImage: vi.fn(), deleteImage: vi.fn() };
    await attachPicture(client as never, ENTRY, { kind: 'none' }, null);
    expect(client.deleteImage).not.toHaveBeenCalled();
  });

  it('reports a failed upload without failing the entry', async () => {
    // Losing the entry because a thumbnail 404'd would be absurd.
    const client = {
      uploadImage: vi.fn(async () => {
        throw new Error('That is not an image Hrček can read.');
      }),
      deleteImage: vi.fn(),
    };
    const message = await attachPicture(
      client as never,
      ENTRY,
      { kind: 'url', url: 'https://cdn.test/a.jpg' },
      blob(32),
    );
    expect(message).toBe('That is not an image Hrček can read.');
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

```bash
pnpm vitest run src/lib/picture.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement**

Create `src/lib/picture.ts`:

```ts
import type { HrcekClient } from './api/client';
import { HrcekApiError, HrcekNetworkError } from './api/errors';
import type { EntryOut } from './api/types';

/** The server's limit. Above it, the address stands in for the bytes. */
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

/** What the picker decided. `unchanged` is the common case. */
export type PictureChoice =
  { kind: 'unchanged' } | { kind: 'none' } | { kind: 'url'; url: string };

/**
 * The bytes, if they can be had. This succeeds when the extension already
 * has access to that origin — which activeTab grants for the tab you are
 * on, so a picture served from the page's own host works, and one on a
 * CDN usually does not. Null means "use image_url instead", never "fail".
 */
export async function fetchPictureBytes(
  url: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<Blob | null> {
  try {
    // No cookies: reading a picture is not worth handing somebody else's
    // site a credential it did not ask this extension for.
    const response = await fetchFn(url, { credentials: 'omit' });
    if (!response.ok) return null;
    const bytes = await response.blob();
    if (bytes.size === 0 || bytes.size > MAX_PICTURE_BYTES) return null;
    // SVG is refused outright by the server; no point spending an upload.
    if (bytes.type.includes('svg')) return null;
    return bytes;
  } catch {
    return null;
  }
}

function filenameFor(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').pop() ?? '';
    return name.length > 0 ? name : 'picture';
  } catch {
    return 'picture';
  }
}

function messageFor(error: unknown): string {
  if (error instanceof HrcekApiError || error instanceof HrcekNetworkError) {
    return error.message;
  }
  return 'The picture could not be attached.';
}

/**
 * Finishes what the entry POST could not. The POST already carried
 * `image_url` when the bytes were unavailable, so only two things are
 * left: uploading bytes when there are any, and deleting a picture that
 * was dropped — a POST cannot remove one.
 *
 * Answers a message when the picture failed, and null when it did not.
 * A picture never fails the entry: the entry is already saved by the
 * time this runs.
 */
export async function attachPicture(
  client: HrcekClient,
  entry: EntryOut,
  choice: PictureChoice,
  bytes: Blob | null,
): Promise<string | null> {
  try {
    if (choice.kind === 'unchanged') return null;
    if (choice.kind === 'none') {
      // 404 is what "there was none to remove" looks like; asking for a
      // delete that was not needed is not a failure worth reporting.
      if (entry.image !== null) await client.deleteImage(entry.id);
      return null;
    }
    if (bytes !== null) {
      await client.uploadImage(entry.id, bytes, filenameFor(choice.url));
    }
    return null;
  } catch (error) {
    return messageFor(error);
  }
}
```

- [ ] **Step 8: Run it**

```bash
pnpm vitest run src/lib/picture.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 9: Give the fake the image routes**

In `tests/fake-hrcek/server.ts`, before the final 404, add:

```ts
const imageRoute = /^\/api\/entries\/(\d+)\/image$/.exec(requestUrl.pathname);
if (imageRoute !== null) {
  const id = Number(imageRoute[1]);
  const holder = [...entries.values()].find((candidate) => candidate.id === id);
  // 404 when the entry is not yours — never 403, which would tell
  // you it exists.
  if (holder === undefined) {
    return json(
      res,
      404,
      errorBody('HRC-CORE-0003', 'The requested resource does not exist.'),
    );
  }
  if (req.method === 'POST') {
    const updated: EntryOut = {
      ...holder,
      image: { url: `/entries/${id}/image/`, width: 1200, height: 630 },
      updated_at: timestamp(),
    };
    entries.set(updated.url, updated);
    return json(res, 200, updated);
  }
  if (req.method === 'DELETE') {
    if (holder.image === null) {
      return json(
        res,
        404,
        errorBody('HRC-CORE-0003', 'The requested resource does not exist.'),
      );
    }
    entries.set(holder.url, { ...holder, image: null, updated_at: timestamp() });
    return res.writeHead(204).end();
  }
}
```

A POST here reads no body: the fake does not decode images, and every test that cares asserts on the resulting `image`, not on the bytes.

- [ ] **Step 10: Run everything and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/lib/picture.ts src/lib/picture.test.ts src/lib/api tests/fake-hrcek
git commit -m "feat: prefer a picture's bytes to its address"
```

### Task 16: The picker

**Files:**

- Create: `src/entrypoints/popup/picker.ts`, `src/entrypoints/popup/picker.test.ts`
- Modify: `src/entrypoints/popup/main.ts`, `src/entrypoints/popup/style.css`

**Interfaces:**

- Consumes: `Candidate` from Task 13, `PictureChoice` from Task 15.
- Produces: `createPicker(host, options): Picker` where

```ts
interface PickerOptions {
  candidates: Candidate[];
  /** The picture the entry already holds, if any. */
  held: string | null;
}
interface Picker {
  choice(): PictureChoice;
}
```

- [ ] **Step 1: Write the failing test**

Create `src/entrypoints/popup/picker.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createPicker } from './picker';
import type { Candidate } from '../../lib/page/candidates';

const CANDIDATES: Candidate[] = [
  { url: 'https://e.test/og.jpg', width: 0, height: 0, fromHead: true },
  { url: 'https://e.test/a.jpg', width: 800, height: 600, fromHead: false },
  { url: 'https://e.test/b.jpg', width: 400, height: 300, fromHead: false },
];

function mount(candidates = CANDIDATES, held: string | null = null) {
  const host = document.createElement('div');
  document.body.append(host);
  const picker = createPicker(host, { candidates, held });
  return { host, picker };
}

describe('createPicker', () => {
  it('preselects the first candidate, so the common case is one click on Save', () => {
    const { picker } = mount();
    expect(picker.choice()).toEqual({ kind: 'url', url: 'https://e.test/og.jpg' });
  });

  it('opens expanded while the choice is still the one proposed', () => {
    const { host } = mount();
    expect(host.querySelector('.hero')).not.toBeNull();
  });

  it('collapses once a choice is made', () => {
    const { host } = mount();
    host.querySelectorAll<HTMLButtonElement>('.tile')[2]!.click();
    expect(host.querySelector('.hero')).toBeNull();
  });

  it('re-opens when the strip is clicked again', () => {
    const { host } = mount();
    host.querySelectorAll<HTMLButtonElement>('.tile')[2]!.click();
    host.querySelector<HTMLButtonElement>('.expand')!.click();
    expect(host.querySelector('.hero')).not.toBeNull();
  });

  it('opens collapsed on an entry that already holds a picture', () => {
    // A picture already held counts as a choice already made.
    const { host, picker } = mount(CANDIDATES, 'https://e.test/held.jpg');
    expect(host.querySelector('.hero')).toBeNull();
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
  });

  it('offers none as the first tile, so clearing is the same gesture as choosing', () => {
    const { host, picker } = mount(CANDIDATES, 'https://e.test/held.jpg');
    host.querySelector<HTMLButtonElement>('.tile.none')!.click();
    expect(picker.choice()).toEqual({ kind: 'none' });
  });

  it('reports unchanged when the held picture is chosen again', () => {
    const { host, picker } = mount(CANDIDATES, 'https://e.test/held.jpg');
    host.querySelector<HTMLButtonElement>('.tile.none')!.click();
    host.querySelector<HTMLButtonElement>('.tile.held')!.click();
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
  });

  it('renders nothing at all when the page offered no picture and none is held', () => {
    const { host, picker } = mount([], null);
    expect(host.innerHTML).toBe('');
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/entrypoints/popup/picker.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/entrypoints/popup/picker.ts`:

```ts
import type { Candidate } from '../../lib/page/candidates';
import type { PictureChoice } from '../../lib/picture';

export interface PickerOptions {
  candidates: Candidate[];
  /** The address of the picture the entry already holds, if any. */
  held: string | null;
}

export interface Picker {
  choice(): PictureChoice;
}

/** How many tiles the strip shows at once. */
const WINDOW = 4;

export function createPicker(host: HTMLElement, options: PickerOptions): Picker {
  const { candidates, held } = options;

  // Nothing to offer and nothing to drop: the row is simply absent.
  if (candidates.length === 0 && held === null) {
    host.innerHTML = '';
    return { choice: () => ({ kind: 'unchanged' }) };
  }

  /** null means "no picture"; the held address means "leave it alone". */
  let selected: string | null = held ?? candidates[0]?.url ?? null;
  // A picture already held counts as a choice already made, so it opens
  // collapsed on what it holds. A fresh page opens on its proposal.
  let expanded = held === null;
  let start = 0;

  type Tile = { key: string; url: string | null; className: string; label: string };

  function tiles(): Tile[] {
    const list: Tile[] = [
      { key: 'none', url: null, className: 'tile none', label: 'No picture' },
    ];
    if (held !== null) {
      list.push({
        key: held,
        url: held,
        className: 'tile held',
        label: 'The picture it has',
      });
    }
    for (const candidate of candidates) {
      if (candidate.url === held) continue;
      list.push({
        key: candidate.url,
        url: candidate.url,
        className: 'tile',
        label: candidate.fromHead ? 'Declared by the page' : 'From the page',
      });
    }
    return list;
  }

  function render(): void {
    const all = tiles();
    const windowed = all.slice(start, start + WINDOW);
    const hero =
      expanded && selected !== null
        ? `<img class="hero" src="${selected}" alt="" />`
        : expanded
          ? '<div class="hero empty">No picture</div>'
          : '';

    host.innerHTML = `
      ${hero}
      <div class="strip">
        <button type="button" class="step" data-step="-1" ${start === 0 ? 'disabled' : ''} aria-label="Earlier pictures">‹</button>
        <div class="tiles"></div>
        <button type="button" class="step" data-step="1" ${start + WINDOW >= all.length ? 'disabled' : ''} aria-label="More pictures">›</button>
        ${expanded ? '' : '<button type="button" class="expand quiet" aria-label="Show the picture larger">⤢</button>'}
      </div>
    `;

    const box = host.querySelector<HTMLDivElement>('.tiles')!;
    for (const tile of windowed) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        tile.className + (tile.key === (selected ?? 'none') ? ' on' : '');
      button.title = tile.label;
      button.setAttribute('aria-label', tile.label);
      if (tile.url === null) {
        button.textContent = 'none';
      } else {
        const image = document.createElement('img');
        image.src = tile.url;
        image.alt = '';
        button.append(image);
      }
      button.addEventListener('click', () => {
        selected = tile.url;
        // Choosing is the moment the hero has done its job.
        expanded = false;
        render();
      });
      box.append(button);
    }

    for (const step of host.querySelectorAll<HTMLButtonElement>('.step')) {
      step.addEventListener('click', () => {
        start = Math.max(
          0,
          Math.min(all.length - 1, start + Number(step.dataset['step']) * WINDOW),
        );
        render();
      });
    }

    host.querySelector<HTMLButtonElement>('.expand')?.addEventListener('click', () => {
      expanded = true;
      render();
    });
  }

  render();

  return {
    choice(): PictureChoice {
      if (selected === null) {
        // Nothing to clear if there was nothing there.
        return held === null ? { kind: 'unchanged' } : { kind: 'none' };
      }
      // Leaving the held picture selected must send no image_url at all.
      if (selected === held) return { kind: 'unchanged' };
      return { kind: 'url', url: selected };
    },
  };
}
```

- [ ] **Step 4: Run it**

```bash
pnpm vitest run src/entrypoints/popup/picker.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Wire it into the popup**

In `src/entrypoints/popup/main.ts`: add `<div class="field" id="picture-field"><label>Picture</label><div id="picture"></div></div>` to the template between Notes and Tags, mount the picker after assignment, and hide the whole field when there is nothing to show:

```ts
const pictureHost = document.querySelector<HTMLDivElement>('#picture')!;
picker = createPicker(pictureHost, { candidates, held: heldPictureUrl });
// The row is absent, not empty, when the page offered nothing.
if (pictureHost.innerHTML === '') {
  document.querySelector<HTMLDivElement>('#picture-field')!.hidden = true;
}
```

Hold `picker`, `candidates` and `heldPictureUrl` at module level beside `renderedFields`. In `main()`, harvest before rendering — the tab id comes from the same query that already gives the address:

```ts
const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
candidates = tab?.id === undefined ? [] : await harvestCandidates(tab.id);
```

`heldPictureUrl` is the absolute address of the picture an entry holds. The API answers a server-relative `image.url`, so resolve it against the configured server:

```ts
heldPictureUrl =
  existing?.image == null ? null : `${settings.serverUrl}${existing.image.url}`;
```

- [ ] **Step 6: Save the picture with the entry**

Replace the body of `save()`'s success path so the picture is attached after the entry exists, in the order the spec sets out — bytes first, then one POST, then the upload or the delete:

```ts
try {
  const choice = picker?.choice() ?? { kind: 'unchanged' as const };
  // Bytes first: the server refuses to fetch from private hosts, and a
  // signed or referer-checked address will not come back for it.
  const bytes = choice.kind === 'url' ? await fetchPictureBytes(choice.url) : null;
  const request = formToSaveRequest(collectForm());
  const outcome = await submitSave(client, {
    ...request,
    // image_url only when the bytes could not be had. Omitted entirely
    // otherwise, which is the documented way to leave a picture alone.
    ...(choice.kind === 'url' && bytes === null ? { imageUrl: choice.url } : {}),
  });
  const trouble = await attachPicture(client, outcome.entry, choice, bytes);
  if (trouble !== null) {
    // The entry stands; only the picture did not.
    setStatus('error', `Saved, but the picture could not be attached: ${trouble}`);
    return;
  }
  setStatus('success', outcome.status === 'created' ? 'Saved.' : 'Updated.');
} catch (error) {
  setStatus('error', messageFor(error));
}
```

- [ ] **Step 7: Style it**

Append to `src/entrypoints/popup/style.css`:

```css
.hero {
  display: block;
  width: 100%;
  max-height: 7rem;
  object-fit: contain;
  background: var(--raised);
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  margin-bottom: 0.35rem;
}
.hero.empty {
  display: grid;
  place-items: center;
  height: 3rem;
  font-size: 0.75rem;
  color: var(--muted);
}
.strip {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.strip .tiles {
  display: flex;
  gap: 0.3rem;
  flex: 1;
  min-width: 0;
}
.tile {
  width: 2.4rem;
  height: 2.4rem;
  flex: none;
  padding: 0;
  background: var(--raised);
  border: 1px solid var(--edge);
  border-radius: 0.3rem;
  overflow: hidden;
  font-size: 0.6rem;
  color: var(--muted);
  cursor: pointer;
}
.tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tile.on {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.tile:hover {
  background: var(--raised);
}
.step,
.expand {
  flex: none;
  width: 1.4rem;
  height: 1.4rem;
  padding: 0;
  font-size: 0.75rem;
  line-height: 1;
  border-radius: 99px;
}
.step:disabled {
  opacity: 0.35;
  cursor: default;
}
```

- [ ] **Step 8: Run everything**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: PASS.

- [ ] **Step 9: Try it by hand**

```bash
pnpm dev
```

Open the popup on a news article. Expect a hero showing the `og:image` and a strip beneath it. Click another tile — it collapses. Click ⤢ — it opens again. Save, reopen the popup on the same page, and check the picker opens collapsed on the picture the entry now holds. Then choose _none_, save, and confirm the picture is gone.

- [ ] **Step 10: Commit**

```bash
git add src/entrypoints/popup
git commit -m "feat: choose a picture from the page"
```

### Task 17: End to end

**Files:**

- Modify: `tests/e2e/save-flow.spec.ts`

- [ ] **Step 1: Add the two journeys**

`tests/e2e/save-flow.spec.ts` already has `configureToken(context, extensionId)`, `openPopup(context, extensionId, url, title)`, a `FAKE_TOKEN` constant, a `SERVER` import and a `beforeEach` that resets the fake. Use all of them. Add:

```ts
test('offers the page’s picture and saves it with the entry', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const address = 'https://example.com/article';
  const popup = await openPopup(context, extensionId, address, 'Article');

  // The picker only appears when the page offered something. Here the
  // popup IS the active tab, so nothing is harvested and the row is
  // absent — which is itself the behaviour worth pinning down.
  await expect(popup.locator('#picture-field')).toBeHidden();
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Saved.');
});

test('keeps the tags and fields an entry holds when only the title changes', async ({
  context,
  extensionId,
}) => {
  await configureToken(context, extensionId);
  const address = 'https://example.com/held';
  await fetch(`${SERVER}/api/entries/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FAKE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: address,
      title: 'Before',
      tags: ['diving'],
      fields: { Price: '129' },
    }),
  });

  const popup = await openPopup(context, extensionId, address, 'ignored');
  await expect(popup.locator('.chip')).toHaveCount(1);
  await popup.fill('#title', 'After');
  await popup.click('#save');
  await expect(popup.locator('#status')).toContainText('Updated.');

  const entry = await (
    await fetch(`${SERVER}/api/entries/by-url/?url=${encodeURIComponent(address)}`, {
      headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
    })
  ).json();
  expect(entry.title).toBe('After');
  // POST replaces, so these only survive because the form sent them back.
  expect(entry.tags).toEqual(['diving']);
  expect(entry.fields).toEqual({ Price: '129' });
});
```

**Why the first test does not harvest.** Playwright drives the popup as an ordinary tab, so the popup itself is the active tab — the same reason `getPageInfo` reads `?url=` under `MODE === 'e2e'`. `harvestCandidates` therefore finds nothing, and the picture row is hidden. That is worth asserting: a page with no picture must not grow an empty picker. Harvesting itself is covered by `candidates.test.ts` and the picker by `picker.test.ts`; the upload path is covered by `picture.test.ts`. Do **not** try to make the popup harvest a different tab here — the e2e build's popup deliberately does not know about one.

- [ ] **Step 2: Run the e2e suite**

```bash
pnpm test:e2e
```

Expected: PASS. If the popup path differs, read `.output/chrome-mv3-e2e/manifest.json` for the real `action.default_popup`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e
git commit -m "test: save a picture and update an entry end to end"
gh stack submit --auto
```

---

# PR 8 — `saved-badge`

### Task 18: The lookup cache

**Files:**

- Create: `src/lib/saved-state.ts`, `src/lib/saved-state.test.ts`

**Interfaces:**

- Produces:
  - `createSavedState(options: { look(url: string): Promise<boolean>; now(): number }): SavedState`
  - `SavedState.get(url: string): Promise<boolean | null>` — true held, false not held, null unknown
  - `SavedState.mark(url: string, held: boolean): void`
  - `const CACHE_TTL_MS = 5 * 60 * 1000`, `const CACHE_LIMIT = 500`

- [ ] **Step 1: Write the failing test**

Create `src/lib/saved-state.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { CACHE_LIMIT, CACHE_TTL_MS, createSavedState } from './saved-state';

function harness(answers: (url: string) => Promise<boolean>) {
  let clock = 0;
  const look = vi.fn(answers);
  const state = createSavedState({ look, now: () => clock });
  return { state, look, tick: (ms: number) => (clock += ms) };
}

describe('createSavedState', () => {
  it('asks once and then answers from the cache', async () => {
    const { state, look } = harness(async () => true);
    expect(await state.get('https://e.test/a')).toBe(true);
    expect(await state.get('https://e.test/a')).toBe(true);
    expect(look).toHaveBeenCalledOnce();
  });

  it('asks again once the answer has gone stale', async () => {
    const { state, look, tick } = harness(async () => true);
    await state.get('https://e.test/a');
    tick(CACHE_TTL_MS + 1);
    await state.get('https://e.test/a');
    expect(look).toHaveBeenCalledTimes(2);
  });

  it('remembers a "not held" answer too', async () => {
    const { state, look } = harness(async () => false);
    expect(await state.get('https://e.test/a')).toBe(false);
    await state.get('https://e.test/a');
    expect(look).toHaveBeenCalledOnce();
  });

  it('answers null when the lookup failed, and does not remember it', async () => {
    // "We could not ask" is not "you have not saved it". An icon that
    // guesses is worse than one that abstains.
    const { state, look } = harness(async () => {
      throw new Error('offline');
    });
    expect(await state.get('https://e.test/a')).toBeNull();
    expect(await state.get('https://e.test/a')).toBeNull();
    expect(look).toHaveBeenCalledTimes(2);
  });

  it('takes a mark without asking, so a save shows at once', async () => {
    const { state, look } = harness(async () => false);
    state.mark('https://e.test/a', true);
    expect(await state.get('https://e.test/a')).toBe(true);
    expect(look).not.toHaveBeenCalled();
  });

  it('shares one lookup between callers racing for the same address', async () => {
    const { state, look } = harness(async () => true);
    await Promise.all([state.get('https://e.test/a'), state.get('https://e.test/a')]);
    expect(look).toHaveBeenCalledOnce();
  });

  it('evicts the oldest once it is full', async () => {
    const { state, look } = harness(async () => true);
    for (let i = 0; i <= CACHE_LIMIT; i++) await state.get(`https://e.test/${i}`);
    look.mockClear();
    await state.get('https://e.test/0');
    expect(look).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/lib/saved-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/saved-state.ts`:

```ts
/** Long enough to spare the server, short enough to notice a website edit. */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/** A browsing session's worth of addresses. */
export const CACHE_LIMIT = 500;

export interface SavedState {
  /** true held, false not held, null could not be asked. */
  get(url: string): Promise<boolean | null>;
  /** Record an answer already known — a save just made, say. */
  mark(url: string, held: boolean): void;
}

interface Entry {
  held: boolean;
  at: number;
}

export function createSavedState(options: {
  look(url: string): Promise<boolean>;
  now(): number;
}): SavedState {
  // Insertion-ordered, which is what makes "evict the oldest" a shift.
  // In memory, not storage: a stale answer surviving a browser restart is
  // worse than asking again.
  const cache = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<boolean | null>>();

  function remember(url: string, held: boolean): void {
    cache.delete(url);
    cache.set(url, { held, at: options.now() });
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  return {
    async get(url: string): Promise<boolean | null> {
      const cached = cache.get(url);
      if (cached !== undefined && options.now() - cached.at < CACHE_TTL_MS) {
        return cached.held;
      }
      // Two tabs on the same address should cost one request, not two.
      const pending = inFlight.get(url);
      if (pending !== undefined) return pending;

      const request = options
        .look(url)
        .then(
          (held) => {
            remember(url, held);
            return held;
          },
          () => {
            // Not remembered: a failure must not harden into an answer.
            return null;
          },
        )
        .finally(() => inFlight.delete(url));

      inFlight.set(url, request);
      return request;
    },

    mark(url: string, held: boolean): void {
      remember(url, held);
    },
  };
}
```

- [ ] **Step 4: Run it**

```bash
pnpm vitest run src/lib/saved-state.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
gh stack add saved-badge
git add src/lib/saved-state.ts src/lib/saved-state.test.ts
git commit -m "feat: remember which addresses are already held"
```

### Task 19: Paint the tick, and the switch that turns it off

**Files:**

- Modify: `src/lib/settings.ts`, `src/lib/settings.test.ts`
- Modify: `src/entrypoints/background.ts`
- Modify: `src/entrypoints/options/main.ts`
- Modify: `src/entrypoints/popup/main.ts`

**Interfaces:**

- Consumes: `createSavedState` from Task 18, `setIcon` from Task 2, `loadExisting` from `src/lib/save.ts`.
- Produces: `Settings.showSavedState: boolean`, defaulting to true.

- [ ] **Step 1: Write the failing settings test**

`src/lib/settings.test.ts` uses `fakeBrowser` from `wxt/testing/fake-browser`, resets it in `beforeEach`, and writes legacy shapes with `fakeBrowser.storage.local.set({ settings: … })`. Add two cases inside its `describe('settings', …)`, in that style:

```ts
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
  });

  expect((await loadSettings())?.showSavedState).toBe(false);
});
```

**Two existing tests in this file break, and must be updated in the same step** — `Settings` gains a required property, so both their `saveSettings` calls and their `toEqual` assertions are now wrong:

- `round-trips settings through storage.local` — add `showSavedState: true` to the object passed to `saveSettings` and to the expected object.
- `drops the authMode left by older versions` — the stored shape stays as it is (it is deliberately a legacy one), but the expectation gains `showSavedState: true`, which is exactly the default this task introduces.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/lib/settings.test.ts
```

Expected: FAIL — `showSavedState` is not on `Settings`.

- [ ] **Step 3: Extend the settings**

In `src/lib/settings.ts`:

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
}
```

with the stored type widened and both functions updated:

```ts
const settingsItem = storage.defineItem<
  | (Omit<Settings, 'showSavedState'> & { authMode?: string; showSavedState?: boolean })
  | null
>('local:settings', { fallback: null });
```

```ts
export async function loadSettings(): Promise<Settings | null> {
  const stored = await settingsItem.getValue();
  if (stored === null) return null;
  // Older versions stored an authMode; session auth is gone, so ignore it.
  return {
    serverUrl: stored.serverUrl,
    token: stored.token,
    // Absent in settings written before the switch existed.
    showSavedState: stored.showSavedState ?? true,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await settingsItem.setValue({
    serverUrl: normalizeServerUrl(settings.serverUrl),
    token: settings.token,
    showSavedState: settings.showSavedState,
  });
}
```

Every existing `saveSettings` call now needs the third property — the options page has two. Pass the current value through (Step 6).

- [ ] **Step 4: Run it**

```bash
pnpm vitest run src/lib/settings.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rewrite the background**

Replace `src/entrypoints/background.ts`:

```ts
import { browser } from 'wxt/browser';
import { clientFromSettings } from '../lib/client-factory';
import { setIcon, type IconState } from '../lib/icon';
import { loadExisting } from '../lib/save';
import { createSavedState } from '../lib/saved-state';
import { loadSettings } from '../lib/settings';

/** Long enough that flicking through tabs costs one request, not ten. */
const LOOKUP_DELAY_MS = 400;

const savedState = createSavedState({
  look: async (url) => {
    const settings = await loadSettings();
    if (settings === null || settings.token === null) throw new Error('not configured');
    return (await loadExisting(clientFromSettings(settings), url)) !== null;
  },
  now: () => Date.now(),
});

let pending: ReturnType<typeof setTimeout> | undefined;

/** Nothing to save on about:, chrome:// or a file the browser is rendering. */
function isSaveable(url: string | undefined): url is string {
  return url !== undefined && (url.startsWith('http://') || url.startsWith('https://'));
}

async function paint(tabId: number, url: string | undefined): Promise<void> {
  const settings = await loadSettings();
  const configured = settings !== null && settings.token !== null;
  if (!configured) return setIcon('unconfigured', tabId);
  if (!settings.showSavedState || !isSaveable(url)) return setIcon('configured', tabId);

  // Colour until proven ticked. A failure leaves it here: "we could not
  // ask" is not "you have not saved it".
  await setIcon('configured', tabId);
  clearTimeout(pending);
  pending = setTimeout(() => {
    void savedState.get(url).then((held) => {
      const state: IconState = held === true ? 'saved' : 'configured';
      void setIcon(state, tabId);
    });
  }, LOOKUP_DELAY_MS);
}

export default defineBackground(() => {
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.tabs.get(tabId).then(
      (tab) => paint(tabId, tab.url),
      () => undefined,
    );
  });

  browser.tabs.onUpdated.addListener((tabId, changes, tab) => {
    // Only when the address changed or the page finished arriving; every
    // other update is noise.
    if (changes.url === undefined && changes.status !== 'complete') return;
    void paint(tabId, tab.url);
  });

  // The popup says so the moment it saves, rather than waiting for a
  // lookup to expire.
  browser.runtime.onMessage.addListener((message: unknown) => {
    const saved = message as { type?: string; url?: string; held?: boolean };
    if (saved.type !== 'hrcek:saved' || saved.url === undefined) return undefined;
    savedState.mark(saved.url, saved.held ?? true);
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id !== undefined) void paint(tab.id, tab.url);
    });
    return undefined;
  });

  browser.storage.local.onChanged.addListener((changes) => {
    if (!('settings' in changes)) return;
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id !== undefined) void paint(tab.id, tab.url);
    });
  });
});
```

- [ ] **Step 6: Add the switch to the options page**

In `src/entrypoints/options/main.ts`, add after the token field:

```ts
    <div class="field">
      <label for="show-saved"><input type="checkbox" id="show-saved" /> Show whether a page is already saved</label>
      <p>The toolbar ticks the hamster on pages you have saved. Doing so
         asks your Hrček about every address you visit. Turn it off and the
         toolbar only says whether the extension is configured.</p>
    </div>
```

and thread it through both `saveSettings` calls:

```ts
const showSavedInput = document.querySelector<HTMLInputElement>('#show-saved')!;
```

```ts
await saveSettings({
  serverUrl,
  token: token.length > 0 ? token : null,
  showSavedState: showSavedInput.checked,
});
```

the same third property in `createToken`'s `saveSettings` call, and in `restore()`:

```ts
showSavedInput.checked = settings.showSavedState;
```

Set the checkbox's default before `restore()` runs, so a first visit shows it on:

```ts
showSavedInput.checked = true;
```

Also add a rule to `src/entrypoints/options/style.css` so the checkbox sits beside its label rather than above it:

```css
.field label:has(> input[type='checkbox']) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
}
.field label > input[type='checkbox'] {
  width: auto;
}
```

- [ ] **Step 7: Tell the background after a save**

In `src/entrypoints/popup/main.ts`, after a successful save, before `setStatus('success', …)`:

```ts
// The tick should appear now, not when the cached answer expires.
void browser.runtime.sendMessage({
  type: 'hrcek:saved',
  url: outcome.entry.url,
  held: true,
});
```

- [ ] **Step 8: Run everything**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: PASS.

- [ ] **Step 9: Try it by hand**

```bash
pnpm dev
```

Check in order: on a page you have not saved, the hamster is plain colour; save it, and the tick appears at once; switch to another tab and back, and it stays ticked; visit a page you have not saved, and it goes back to plain; open `about:support`, and it stays plain with no request made; turn the switch off in settings and confirm the tick stops appearing anywhere.

- [ ] **Step 10: Commit and submit the stack**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts src/entrypoints
git commit -m "feat: tick the hamster on a page you already hold"
gh stack submit --auto
gh stack view --json
```

---

## Finishing

- [ ] Run the whole suite one more time from the top of the stack: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`.
- [ ] Update `CLAUDE.md`: the ladder example for `inject.ts`, the new `assets/` and `src/public/icon/` directories, and `pnpm refresh-schema` needing an explicit path from a worktree. Commit that on `saved-badge`.
- [ ] `gh stack view --json` and hand the PR URLs over.
