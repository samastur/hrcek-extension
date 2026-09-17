# Session report: building the extension, and where linting stands

**Written:** 2026-09-17 11:46 CEST
**Covers:** 2026-09-16 (repository created, v1 built and merged) through
2026-09-17 11:46 CEST
**Repository state at writing:** `main` at `d6e3d80`; PRs #1–#8 and #10 all
merged; no open pull requests.

This is a record of what was decided and why, written so that a person
picking the project up later does not have to reconstruct the reasoning
from the git history. It covers the whole session; the tooling section
answers "what do we lint with, and what was never examined."

## 1. What was built

A Firefox-first browser extension that saves pages to a
[Hrček](../../../hrcek) server, written in TypeScript on the WXT
framework. Version 1 does what the spec set out:

- A toolbar popup pre-filled with the active tab's address and title. It
  reads `GET /api/entries/by-url/` first, so if the address is already
  held the existing entry is loaded and saving is a conscious merge
  rather than a blind replace. Title, notes, tags and the account's
  custom fields are editable before saving.
- An options page holding the server address and one of two
  authentications: an API token, or a username and password used once to
  open a session. The password is never persisted anywhere.
- Failures are shown with the server's own translated message; code
  branches on the stable error `code`, never the message text.

Chrome and Safari were designed for but not built. The offline queue is
not implemented; the save path is shaped so it can be added behind one
function.

## 2. How the work was run

The sequence was: brainstorming to a design spec, a written
implementation plan, execution task-by-task with a fresh agent per task
and an independent review after each, then a whole-branch review, then
delivery as a stack of pull requests.

Spec: `docs/superpowers/specs/2026-09-16-hrcek-extension-design.md`.
Plan: `docs/superpowers/plans/2026-09-16-hrcek-firefox-extension.md`.

Twelve tasks were executed. Three needed a fix round after review; the
rest passed first time. The final review produced three findings that
changed the code (section 5).

## 3. Decisions worth remembering

| Decision                                        | Reason                                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WXT over hand-rolled Vite                       | Generates per-browser manifests, runs the extension in a real browser with reload, and keeps one source tree for Firefox MV2 and Chrome MV3.                   |
| Vanilla TypeScript for the UI                   | The popup and options page are forms. No framework runtime to ship or maintain; the planned "unsynced items" tab is another view, not a rewrite.               |
| API types generated, client hand-written        | `openapi-typescript` turns the server's committed `openapi.json` into types, so server drift becomes a type error. The client itself stays small and readable. |
| Token in `storage.local`, password never stored | Extension storage is not encrypted, so "encrypting" with a key in the same profile is theatre. The password opens a session and is discarded.                  |
| No required host permissions                    | The configured server's origin is requested at runtime. Only the `--mode e2e` build grants localhost, for Playwright.                                          |
| A fake Hrček in-repo                            | e2e and contract tests run deterministically without the Django server. It is typed against the generated schema so it cannot silently drift.                  |

Two corrections were forced by reality rather than chosen:

- `EntryIn.title` and `notes` were generated as required, because the
  schema gives them defaults. The API requires only `url`. Fixed by
  generating with `--default-non-nullable false`.
- The e2e build writes to `.output/chrome-mv3-e2e`, not
  `.output/chrome-mv3` as the plan assumed.

## 4. Linting and code-quality tooling

### What is in place

- **ESLint 10** with flat config (`eslint.config.js`), composing
  `@eslint/js` recommended and `typescript-eslint` recommended. One
  project rule: `@typescript-eslint/no-unused-vars` with
  `argsIgnorePattern: '^_'`, so a parameter kept for interface
  compliance can be named `_method` without a lint error.
- **Prettier 3** for formatting, single quotes, 90-column print width.
  `pnpm lint` runs `eslint . && prettier --check .`, so formatting
  drift fails the same gate as a lint error. `pnpm format` rewrites.
- **Ignores:** `.output`, `.wxt`, `node_modules`, `playwright-report`,
  `test-results`, and `src/lib/api/types.gen.ts` — the last because it
  is generated and must never be hand-edited.
- **TypeScript in strict mode**, plus `noUncheckedIndexedAccess`.
  `pnpm typecheck` runs `tsc --noEmit` and is treated as part of
  linting for gating purposes.

### Where the gates are

Two, deliberately:

1. `.githooks/pre-commit` runs `pnpm typecheck`, `pnpm lint` and
   `pnpm test`, and refuses the commit if any fails. It installs itself
   — `pnpm install` runs a `prepare` script that points
   `core.hooksPath` at `.githooks`, so there is no husky dependency and
   nothing to remember on a fresh clone. The end-to-end suite is too
   slow for a commit hook and is left to CI. `git commit --no-verify`
   is the deliberate escape hatch; CLAUDE.md says not to use it to dodge
   a failing test.
2. `.github/workflows/ci.yml` runs typecheck, lint, unit and contract
   tests, the Playwright suite, build and zip on every pull request and
   every push to `main`.

Both gates were added late, in PR #10, after it emerged that nothing had
ever run on GitHub: the workflow existed only on a branch four merges up
the stack, and most pull requests targeted other feature branches rather
than `main`, so GitHub had no workflow to run. Three pull requests had
already been merged unchecked. Moving CI to a branch based on `main`
fixed it; the first run was green in 33 seconds.

The pre-commit hook was verified by making it fail on purpose: a
deliberately failing test was staged, the commit was attempted, the hook
rejected it and `HEAD` did not move.

### What was NOT explored

This is the honest part of the report. The linting setup was assembled
at scaffold time from what is conventional for a TypeScript project, and
adjusted twice when it broke. **No comparative evaluation of linting
tools was performed.** Specifically, none of these were tried,
benchmarked, or ruled out on evidence:

- **Biome** or **oxlint** as a faster single-binary replacement for
  ESLint plus Prettier. Both are plausible for a project this size and
  would collapse two tools into one.
- **dprint** as a formatter.
- **Stylelint** for the extension's CSS, which is currently unlinted.
- Stricter type-aware ESLint presets
  (`typescript-eslint` `recommendedTypeChecked` or `strictTypeChecked`),
  which catch real bugs the untyped recommended set misses, at the cost
  of slower runs. This is the most defensible gap to close first.
- Any lint rules specific to web extensions or to import hygiene
  (`eslint-plugin-import`), including a rule that would mechanically
  enforce the architecture boundary described in CLAUDE.md — that
  `src/lib/` must never import from `src/entrypoints/`. Today that rule
  lives only in prose and in reviewers' attention.

One tooling constraint was discovered the hard way rather than chosen:
**TypeScript is pinned to `^6.0.3`** because an unpinned install
resolved TypeScript 7, which `typescript-eslint` 8.70 cannot parse, and
lint broke immediately. That pin should be revisited once
`typescript-eslint` supports TypeScript 7 — it is the one piece of the
toolchain deliberately held back.

### Suggested next steps for tooling

In the order I would do them:

1. Add the `src/lib` → `src/entrypoints` import restriction as an actual
   lint rule. The boundary is the project's main architectural
   invariant and is currently unenforced.
2. Evaluate `recommendedTypeChecked`. Measure the CI time cost before
   committing to it.
3. Revisit the TypeScript 6 pin when the ecosystem catches up.
4. Consider Biome only if lint time becomes annoying; today the whole
   gate runs in seconds, so there is no problem to solve.

## 5. Review findings that changed the code

Recorded because they are the substantive bugs that independent review
caught, not process trivia:

- **Blind-replace window in the popup.** If the initial by-url lookup
  failed for any reason other than "not held" — a network blip, a 5xx —
  the popup rendered an empty form with Save still armed. Saving once
  the network recovered would replace the held entry and wipe its notes
  and tags: exactly the data loss look-before-write exists to prevent.
  Save now re-checks before writing when the initial lookup failed.
  Covered by an e2e regression test.
- **Contract suite did not pin the dangerous semantics.** It checked
  status codes and lookups but not that a second save clears notes and
  tags while custom fields survive, not that `""` clears a field, and
  not that address normalization agrees between client and server.
  Those are the behaviours most likely to diverge between the fake and
  the real server, and they now run against both.
- **Misleading recovery copy.** The options page promised a permission
  prompt "on first save" that never comes: a declined optional
  permission simply makes every request fail. It now says access was
  declined and that saving again re-asks.
- **Test seam in production code.** `getPageInfo` in the popup accepted
  `?url=&title=` to override the active-tab lookup, which is how
  Playwright drives the popup — but it shipped in production bundles,
  where anything able to navigate the popup URL controlled the
  pre-filled form. It is now gated on `import.meta.env.MODE === 'e2e'`,
  a build-time constant, and is verifiably absent from the Firefox and
  Chrome production builds.

Earlier task-level reviews also caught two swallowed-error paths in the
popup and options pages, where a failure left the status line stuck on
"Saving…" with nothing shown to the person.

## 6. Delivery

Nine pull requests, all merged on 2026-09-16:

| PR  | Contents                                                     |
| --- | ------------------------------------------------------------ |
| #1  | Design spec and implementation plan                          |
| #2  | WXT scaffold and generated API types                         |
| #3  | Typed API client with token and session auth                 |
| #10 | CI workflow and pre-commit gate (opened later, merged early) |
| #4  | Settings storage and save flow                               |
| #5  | Popup and options pages                                      |
| #6  | Fake Hrček server, Playwright e2e, contract tests            |
| #7  | e2e step in CI, CLAUDE.md, README                            |
| #8  | Final-review fixes                                           |

Two process notes worth keeping:

- Commit messages carry no AI authorship trailers, and pull request
  descriptions carry no generated-with footers. History was rewritten
  once, early, to remove them. That rewrite is what later caused a local
  `main` to diverge from the remote and refuse to pull; the fix was to
  reset the local branch to `origin/main`, the two local commits being
  byte-identical in content to their rewritten replacements.
- One force-push was correctly rejected by `--force-with-lease` because
  the remote branch had been rebased in the meantime. A plain `--force`
  would have silently discarded that work.

## 7. Known gaps

- Chrome and Safari are designed for but unbuilt.
- No offline queue; the popup reports save failures instead.
- `cookies` is a required manifest permission though only password mode
  needs it. Making it optional would shrink the install prompt and is
  worth doing before submitting to AMO.
- The gecko extension id is a placeholder and there are no icons. Both
  are on the pre-AMO list in CLAUDE.md.
- Small UI polish deferred: the account link is inert until the server
  URL field changes; the address field stays editable after an existing
  entry loads; tags containing commas cannot round-trip through the
  comma-separated input.
