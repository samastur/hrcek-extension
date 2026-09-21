# Hrček extension v2 — design

Date: 2026-09-22
Status: approved

Builds on [the v1 design](2026-09-16-hrcek-extension-design.md), which
still describes the architecture, the auth story and the build setup.
This document covers only what changes.

## Purpose

v1 can save a page. It cannot show you what it is about to save, it
guesses at your fields, its toolbar button looks the same whatever the
state, and it looks nothing like the website it talks to. v2 fixes
those, using two API calls the server grew in `a46e8a1`.

Six pieces of work:

1. Icons for the toolbar, in three states.
2. Updating an entry you already hold, without losing what it holds.
3. Storing a picture from the page, preferring an upload to an address.
4. Only title, notes, picture and tags always visible; account fields
   folded away.
5. The look of the website, light and dark.
6. A picture picker that shows a few candidates at a time, head
   first, then the document's images biggest first.

## What the server now offers

`GET /api/fields/` answers what an account's entries may carry: `name`,
`kind` (`text`, `number` or `choice`) and, for a choice, its `options`.
`name` is the key an entry's `fields` object uses, so what the client
reads is what it writes back.

`GET /api/labels/` answers the labels in use, alphabetically ignoring
capitals, narrowed by `starts_with` — matched as a literal, not a
pattern. Paging is by cursor: pass the last name served as `after`.
`count` is how many match, not how many the page carries. A page holds
a thousand, the default and the maximum both; asking for more is 422.

Neither can be written through the API. Both are read-only here.

## Wording

The extension says what the website says: **Address, Title, Notes,
Picture, Tags**. The API keys are `url`, `title`, `notes`, `tags`,
`image`. Renaming them to Description and Labels is a server-side
decision, not one to take unilaterally in a client; it is listed under
[later](#later).

## Where the code goes

`src/lib/` remains the only home for logic, and never imports from
`src/entrypoints/`. New modules:

| Module                       | Holds                                                    |
| ---------------------------- | -------------------------------------------------------- |
| `src/lib/api/client.ts`      | `listFields`, `listLabels`, `uploadImage`, `deleteImage` |
| `src/lib/ui/theme.css`       | The design tokens, imported by popup and options         |
| `src/lib/page/candidates.ts` | Ranking and de-duplication of harvested images           |
| `src/lib/picture.ts`         | Deciding between bytes, an address, and a delete         |
| `src/lib/saved-state.ts`     | The per-tab cache and lookup policy                      |
| `src/lib/platform/inject.ts` | Running a script in the active tab, per browser          |
| `src/entrypoints/harvest.ts` | The script that runs in the page                         |

`candidates.ts`, `picture.ts` and `saved-state.ts` are pure: they take
their clock, their fetcher and their browser calls as arguments, so
every rule below is testable without a browser.

`inject.ts` is rung three of the browser ladder — a platform module
behind a shared interface — because MV2 offers `tabs.executeScript`
and MV3 offers `scripting.executeScript`, and the two do not share a
signature. A build-time switch cannot paper over that.

`harvest.ts` is an **unlisted** script, injected on demand under
`activeTab` when the popup opens. It is not a registered content
script: the extension has no business running on every page you load,
and a registered script would need host permissions the manifest
deliberately does not hold.

The MV3 manifest gains the `scripting` permission, which MV3 requires
in order to inject at all. MV2 needs nothing new — `tabs.executeScript`
is covered by `activeTab`. This is a per-browser manifest difference,
so it belongs in `wxt.config.ts`: rung one of the ladder.

## The look

`src/lib/ui/theme.css` carries the server's token block verbatim —
`--surface`, `--raised`, `--edge`, `--ink`, `--muted`, `--accent`,
`--accent-ink`, `--danger`, `--danger-ink` — with `color-scheme: light
dark` and the same `prefers-color-scheme` override, so both themes
follow the system without per-element styling. Radii, input treatment
and button treatment match `hrcek.css`.

Plain CSS, not Tailwind. Two pages do not earn a build step, and the
tokens are the part that actually carries the resemblance.

The popup is 360px wide. The options page is a narrow centred column,
like the website. Both carry the hamster head in the header.

The address is a small muted line, truncated, **not editable**. It is
whatever tab you are on; an input inviting you to retype it invites
you to save the wrong thing.

## The form

Always visible: Title, Notes, Picture (only when the page offers one),
Tags.

Everything the account has defined folds into a `<details>` labelled
_Your fields_, closed by default. They are optional by nature, and on
most saves nobody touches them.

### Fields come from the server

One input per definition from `GET /api/fields/`:

| `kind`   | Input                                                 |
| -------- | ----------------------------------------------------- |
| `text`   | text input                                            |
| `number` | text input with `inputmode="decimal"`                 |
| `choice` | `<select>`, first option `—`, then `options` in order |

Nothing is hard-coded. `Price` and `Priority` are only what a fresh
account starts with.

**When `/api/fields/` fails**, the `<details>` is built from the keys
the entry itself came back with. An existing entry's values stay
visible and editable, and — more importantly — the save stays safe:
see the rule in [Saving](#saving-an-entry-you-already-hold).

### Tags are chips

Each tag is a chip with an ×. Typing in the input queries
`GET /api/labels/?starts_with=`, debounced, and offers what comes
back. Tags already on the entry are filtered out of the suggestions,
so one cannot be added twice — the constraint is enforced by never
offering the duplicate, not by rejecting it afterwards.

Keys:

- **Enter** takes the highlighted suggestion when the list is open.
- **Enter** with uncommitted text and no highlighted suggestion
  commits that text as a tag **and then** submits. Submitting while
  silently dropping what somebody just typed is the wrong trade.
- **Enter** on an empty input submits.
- **Comma** or **→** commits what is typed as a new tag.
- **Backspace** on an empty input removes the last chip.

Tags are trimmed and compared case-insensitively for the
duplicate check, since the server cannot hold two labels differing
only by case.

## Saving an entry you already hold

The popup already looks before it writes. What changes is what it
sends back.

- **`title`, `notes`, `tags` are always sent in full.** `POST
/api/entries/` replaces; anything left out is cleared.
- **`fields` is patched, so the form sends every field it rendered**,
  empty ones as `""` to clear them. It never sends a field it did not
  render. This is why the fallback above matters: a form that guessed
  at field names could clear a value it never showed.
- **`image_url` is omitted unless the picture changed.** Omitting it
  is documented as changing nothing, which is what lets a save leave a
  picture alone.
- **Removing a picture is `DELETE /api/entries/{id}/image`.** A POST
  cannot do it.

The v1 guard stays: when the opening lookup failed for any reason
other than a confirmed 404 `HRC-CORE-0003`, the save re-checks before
writing, so a network blip cannot turn an update into a blind replace.

Error handling is unchanged in principle — branch on `code`, show
`message`.

## The picture

### Finding candidates

`harvest.ts` collects, in this order:

1. `og:image`, `og:image:secure_url`, `twitter:image`,
   `twitter:image:src`, `link[rel=image_src]`, `itemprop=image`.
2. Every `<img>` in the document, by `currentSrc` so that `srcset`
   and `<picture>` give what is actually displayed, sorted on rendered
   area, largest first.

Then: resolved to absolute addresses, de-duplicated, SVG dropped (the
server refuses it outright — it is a document that can carry script),
anything under 100×100 dropped, and the list capped at 60 so the
message back from the page stays small.

Size means `naturalWidth`/`naturalHeight` where the browser knows
them, falling back to the rendered box when it does not — a lazy image
that has not loaded yet reports nothing natural. Head candidates carry
no size at all and are never dropped for being small.

Head candidates come first even when they are smaller. A page that
says which picture represents it has answered the question.

### Choosing one

The picker appears only when there is at least one candidate.

It opens as a hero — the current candidate at a size worth judging —
above a strip to step through the rest. Once a choice is made it
collapses to the strip alone, reclaiming the height; clicking the
strip opens it again.

An entry that already holds a picture counts as a choice already made,
so it opens collapsed, showing what it holds.

On a page not yet saved, the **first candidate is preselected** — the
head image when there is one — and shown in the hero. Nothing has been
chosen, so the picker stays open; but the common case is still one
click on Save. Preselecting nothing would mean most saves quietly go
without a picture the page had already nominated.

The first tile in the strip is always **none**, so clearing a picture
is the same gesture as choosing one.

Thumbnails are ordinary `<img>` tags pointing at the candidate
addresses. Displaying a remote image needs no host permission; only
reading its bytes does.

### Storing it

In order, when the picture has changed:

1. **Try the bytes.** `fetch` the chosen address from the extension.
   This succeeds when the extension already has access to that origin
   — which `activeTab` grants for the tab you are on, so a picture
   served from the page's own host works. A picture on a CDN usually
   does not.
2. **One entry POST**, carrying `image_url` **only if** step 1 came
   back empty-handed. If the bytes are in hand, `image_url` is left
   out entirely.
3. **Upload the bytes** to `POST /api/entries/{id}/image` as
   multipart, if there are any.
4. **If the choice was _none_ and the entry held a picture**,
   `DELETE /api/entries/{id}/image` after the save.

Bytes are preferred because the server fetching an address is a weaker
guarantee: it refuses private, loopback and link-local hosts, and a
picture behind a referer check or a signed URL will not come back.

Bytes over 10 MB, or of a type the server refuses, skip step 1 and
fall through to `image_url` rather than failing.

**A picture never fails the entry.** When the attachment fails the
save still stands and the status says so — "Saved, but the picture
could not be attached: …" with the server's message. Losing the entry
because a thumbnail 404'd would be absurd.

## Icons and the toolbar

Three sets at 16, 32, 48, 96 and 128, generated from `hrcek6.png` by
`scripts/make-icons.sh`:

| State                     | Icon                                        |
| ------------------------- | ------------------------------------------- |
| Not configured            | Greyscale head                              |
| Configured, page not held | Colour head                                 |
| Page already held         | Colour head with a green tick at the corner |

Both source PNGs are committed under `assets/`. A generation script
whose input is missing is not a generation script.

The generated files are committed too, under `src/public/icon/` —
`16.png` … `128.png` for the colour set, which WXT wires into the
manifest by convention, and `grey-16.png` / `saved-16.png` and their
siblings beside them, set at runtime with `action.setIcon`. A build
that shells out to ImageMagick would put a dependency on every
contributor's machine for files that change about once a year.

`hrcek-small.png` — the full mascot, on white — is for the store
listing. It is not used in the extension: a white rectangle looks
wrong on a dark popup.

### Knowing whether a page is held

The background decides, on `tabs.onActivated` and on
`tabs.onUpdated` when the address changes or loading completes:

- Not http or https → the plain icon, no request. There is nothing to
  save on `about:` or `chrome://`.
- No token configured → the greyscale icon, no request.
- Otherwise → a TTL cache, and on a miss a debounced
  `GET /api/entries/by-url/`.

404 with `HRC-CORE-0003` means not held. **Any other failure leaves
the plain colour**, because "we could not ask" is not "you have not
saved it", and an icon that guesses is worse than one that abstains.
Failures are not retried on a timer.

Saving from the popup marks the address held straight away, so the
tick appears without a round trip.

The cache holds an address → held/not-held with a timestamp, a TTL of
five minutes and a bound of 500 addresses, evicted oldest first. It
lives in memory, not storage: a stale answer surviving a browser
restart is worse than asking again.

The lookup is debounced by 400ms, so flicking through tabs costs one
request rather than one per tab. Label suggestions are debounced by
200ms, which is about as long as a lookup can take before typing
starts to feel watched.

### What this costs, said out loud

This asks your Hrček about **every address you visit**. It is your own
server, but it is still a record of your browsing that did not exist
before, and it is a request per page.

So the options page gains one switch — _Show whether a page is already
saved_, on by default — with that cost stated next to it. Off means
the toolbar shows configured-or-not and nothing more, and no lookups
happen.

## Testing

Unit tests, colocated:

- `candidates.ts` — head before body, sort by area, de-duplication,
  SVG and small images dropped, the cap.
- The chip model — commit keys, the duplicate check, case folding,
  Enter-commits-then-submits.
- Form → request mapping — every rendered field sent, `""` for the
  empty ones, nothing sent for fields that were not rendered.
- `picture.ts` — each of the four branches, including bytes too large
  falling through to `image_url`, and a failed attachment leaving a
  successful save.
- `saved-state.ts` — TTL expiry, eviction, 404 versus other failures,
  the debounce.

The fake Hrček grows `/api/fields/`, `/api/labels/` (with
`starts_with`, `after`, and the 422 above a thousand), `POST` and
`DELETE` on `/api/entries/{pk}/image`, and `image_url` on entry POST —
typed against the regenerated schema, mirroring documented behaviour
including error codes.

`pnpm refresh-schema` must run first; from a worktree it needs the
server path as an argument, since `../hrcek` does not resolve there.

End to end, in Chromium: save a page carrying an `og:image` and see
the picture land; reopen the popup on a held address, change the title
and see tags and field values survive.

## The stack

Eight pull requests, each branched on the one before, bottom first.

| #   | Branch              | What                                                                     |
| --- | ------------------- | ------------------------------------------------------------------------ |
| 1   | `icons`             | Icon assets, generation script, colour and greyscale by configured state |
| 2   | `api-fields-labels` | Schema refresh, the two client methods, fake server, contract tests      |
| 3   | `design-tokens`     | The restyle of popup and options as they stand                           |
| 4   | `fields-details`    | The `<details>`, built from `/api/fields/`                               |
| 5   | `tag-chips`         | The chip input and `/api/labels/` autocomplete                           |
| 6   | `entry-updates`     | The save rules above                                                     |
| 7   | `picture`           | Harvest, picker, upload                                                  |
| 8   | `saved-badge`       | Background lookup, cache, the tick, the switch                           |

Icons go first because they depend on nothing, so they unblock the
rest. The restyle lands before the three form PRs so those arrive
already styled, rather than being written once and restyled after.

Every PR passes `pnpm typecheck`, `pnpm lint` and `pnpm test` — the
pre-commit hook enforces it, and `--no-verify` is not an option.

## Later

Not in this work, and each its own decision:

- A keyboard shortcut for the popup.
- An "Open in Hrček" link on a held entry.
- Renaming Notes and Tags to Description and Labels, on the server
  first and the extension after.
- The offline queue v1 left room for.
