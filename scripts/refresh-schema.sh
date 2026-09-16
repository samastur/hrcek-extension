#!/bin/sh
# Copies the Hrček OpenAPI schema into this repo and regenerates TS types.
# The schema is vendored so CI does not need the hrcek checkout.
set -eu
SRC="${1:-../hrcek/docs/api/openapi.json}"
mkdir -p docs/api
cp "$SRC" docs/api/openapi.json
pnpm exec openapi-typescript docs/api/openapi.json -o src/lib/api/types.gen.ts
pnpm exec prettier --write docs/api/openapi.json src/lib/api/types.gen.ts
