// Opt-in: writes entries into the token owner's real account (all under
// https://contract-tests.example.com/<uuid>/…). Point it at a local dev
// Hrček, not at one whose data you care about.
import { describe } from 'vitest';
import { runContractSuite } from './suite';

const url = process.env.HRCEK_URL;
const token = process.env.HRCEK_TOKEN;
// Optional: set both to also check that credentials can mint a token.
const identifier = process.env.HRCEK_IDENTIFIER;
const password = process.env.HRCEK_PASSWORD;

if (url === undefined || token === undefined) {
  describe.skip('Hrček API contract (real — set HRCEK_URL and HRCEK_TOKEN)', () => {});
} else {
  runContractSuite(
    'real',
    () => ({
      baseUrl: url.replace(/\/+$/, ''),
      token,
      runId: crypto.randomUUID(),
    }),
    identifier !== undefined && password !== undefined
      ? { identifier, password }
      : undefined,
  );
}
