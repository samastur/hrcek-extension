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
