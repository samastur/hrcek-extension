# Chrome verification: does `optional_host_permissions` work

**Written:** 2026-09-23
**Task:** Task 1 of `.superpowers/sdd/2026-09-23-hrcek-extension-v3/` — de-risk
the extension's whole runtime-origin design before later tasks build on it.

The design has the manifest request no host permissions up front. Instead
the options page requests the configured server's origin at runtime, via
`optional_host_permissions: ["<all_urls>"]`. Everything else in the plan is
cheap to change; this assumption is not, so it was checked first.

## How this was verified

The brief's Steps 2 and 3 call for hand-driving a real, GUI Chrome:
clicking through `chrome://extensions`, and accepting a native
permission-prompt dialog on the options page. That could not be done from
this (headless, non-interactive) session. The controller directed an
automated substitute instead: a temporary Playwright script that launches
Chromium with the built extension loaded via `--load-extension`, and reads
the extension's own state directly through `chrome.runtime.getManifest()`
and the `chrome.permissions` API, plus the `chrome://extensions` DOM.

That script lived at a path under the session scratchpad, was never part of
this repository, and has been discarded — it is not committed. What follows
is what it found, quoted directly from its output.

**Chromium version used:** 153.0.8010.12 (`HeadlessChrome/153.0.0.0` in the
UA string), launched via Playwright's `channel: 'chromium'`, which is the
"new headless mode" build that supports loading unpacked extensions
headlessly.

## Step 1: the built manifest

```
pnpm build:chrome
cat .output/chrome-mv3/manifest.json
```

produced (formatted):

```json
{
  "manifest_version": 3,
  "name": "Hrček",
  "description": "Save links to your Hrček",
  "version": "0.1.0",
  "icons": { "16": "icon/16.png", "32": "icon/32.png", "48": "icon/48.png", "96": "icon/96.png", "128": "icon/128.png" },
  "permissions": ["activeTab", "storage", "tabs", "scripting"],
  "optional_host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_title": "Hrček", "default_popup": "popup.html", "default_icon": { ... } },
  "options_ui": { "open_in_tab": false, "page": "options.html" }
}
```

This matches the brief's expectation exactly: `manifest_version: 3`,
`optional_host_permissions: ["<all_urls>"]`, `permissions` holding
`activeTab`, `storage`, `tabs`, `scripting`, and no `host_permissions` key.

## Steps 2-3 (automated substitute): what Chrome actually parsed and granted

### `chrome.runtime.getManifest()` — read from inside the extension's own service worker

```json
{
  "action": {
    "default_icon": {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png"
    },
    "default_popup": "popup.html",
    "default_title": "Hrček"
  },
  "background": { "service_worker": "background.js" },
  "description": "Save links to your Hrček",
  "icons": {
    "16": "icon/16.png",
    "32": "icon/32.png",
    "48": "icon/48.png",
    "96": "icon/96.png",
    "128": "icon/128.png"
  },
  "manifest_version": 3,
  "name": "Hrček",
  "optional_host_permissions": ["<all_urls>"],
  "options_ui": { "open_in_tab": false, "page": "options.html" },
  "permissions": ["activeTab", "storage", "tabs", "scripting"],
  "version": "0.1.0"
}
```

Chrome kept `optional_host_permissions` verbatim — it is not stripped,
renamed, or rejected. This is the load-bearing result.

### `chrome.permissions.getAll()` — what is granted at rest, right after load

```json
{
  "origins": [],
  "permissions": ["activeTab", "storage", "tabs", "scripting"]
}
```

`origins` is empty: the optional host permission is not silently granted —
it is only declared as requestable, as designed.

### `chrome.permissions.contains({origins: ["http://127.0.0.1:8787/*"]})`

```
false
```

As expected — nothing has asked for it yet.

### Extension load errors

The service worker started without incident (`context.waitForEvent('serviceworker')`
resolved immediately, no timeout), and `context.on('console', ...)` recorded
no `error`-level console messages during load.

The `chrome://extensions` page was also read directly (piercing its Shadow
DOM, since its content lives inside `<extensions-manager>` custom elements
and does not show up in a plain `document.body.innerText`). Findings:

- The extension's card in the list shows no "Errors" link/button — that
  control only renders when Chrome has recorded a runtime or manifest error
  for the extension, and none did.
- Navigating to `chrome://extensions/?errors=<id>` silently redirected to
  plain `chrome://extensions/` rather than opening an error dialog — this
  Chrome version appears to only honor that query parameter when there is
  something to show, consistent with there being no errors.
- The extension's **Details** page shows a **Permissions** section reading
  "This extension requires no special permissions" (the four `permissions`
  entries are not treated as sensitive/warning-worthy), and a **Site
  access** section reading "This extension has no additional site access" —
  i.e. Chrome parsed the manifest, found nothing to warn about, and
  correctly shows zero site access at rest, matching `permissions.getAll()`
  above.

No warning, error, or truncation tied to `optional_host_permissions` was
found anywhere Chrome surfaces extension problems.

## What could not be automated, and remains for a person to do

The above proves Chrome accepts and correctly parses
`optional_host_permissions`, and grants nothing at install time. It does
**not** prove the request-time UX works end to end, because two things are
genuinely out of reach of this automated check:

1. **The interactive origin-grant prompt.** `chrome.permissions.request()`
   opens a small Chrome-native permission bubble anchored to the extension
   (not a web page DOM the extension controls), asking the person to allow
   or deny access to the requested origin. Playwright's automation surface
   does not extend into Chrome's own browser UI, so this bubble cannot be
   triggered or clicked from a script. **A person needs to**: load
   `.output/chrome-mv3` unpacked in a real Chrome, open the extension's
   options page, enter a server address (`http://127.0.0.1:8787` is fine),
   press Save, confirm the permission bubble appears naming that origin,
   accept it, and confirm the options page's status line reads `Saved.`
   with no "Site access was declined" tail. If it instead auto-denies or
   never prompts, that is the finding to bring back — it would mean the
   optional-permission route does not work as designed even though the
   manifest itself is accepted.
2. **The install-time warning that a real Chrome may show when _first_
   loading an unpacked extension** (a one-time interstitial some Chrome
   versions show for unpacked/developer-mode extensions, distinct from the
   per-extension error banner checked above). This session's headless
   Chromium loads extensions non-interactively via `--load-extension` and
   never renders that interstitial, so its absence here is not evidence
   either way. **A person needs to**: watch for such a warning the first
   time they use "Load unpacked" in `chrome://extensions` with Developer
   mode on, and note whether it mentions permissions specifically.

## Verdict

**`optional_host_permissions: ["<all_urls>"]` works** — Chrome 153 parses
it, keeps it in the manifest exactly as written, grants no origin access at
install time, and raises no error or warning anywhere the extensions UI
surfaces problems. The runtime-origin design this plan depends on is sound
on the manifest/permissions-API side.

The one part of the design not yet verified is the human-facing permission
prompt itself (point 1 above) — that still needs a person with a real,
interactive Chrome before later tasks (in particular the options-page save
flow and Task 12's `docs/store/permissions.md`) can rely on its exact
copy and behavior. Nothing found here contradicts the design; the gap is
in what could be checked, not in a discovered problem.

## Files changed

- `docs/reports/2026-09-23-chrome-verification.md` (this report)
- `wxt.config.ts` — **not modified**. The finding did not demand it: the
  manifest built exactly as the brief expected.
