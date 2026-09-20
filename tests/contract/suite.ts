import { describe, expect, it } from 'vitest';
import { HrcekClient } from '../../src/lib/api/client';
import { loadExisting } from '../../src/lib/save';

export interface ContractTarget {
  baseUrl: string;
  token: string;
  /** Unique per run so re-runs against a real server never collide. */
  runId: string;
}

/**
 * Credentials for minting a token. Passed separately from the target
 * factory because the skip decision is made while tests are collected,
 * before any beforeAll hook has run.
 */
export interface ContractCredentials {
  identifier: string;
  password: string;
}

export function runContractSuite(
  name: string,
  target: () => ContractTarget,
  credentials?: ContractCredentials,
): void {
  describe(`Hrček API contract (${name})`, () => {
    const client = () => new HrcekClient(target().baseUrl, target().token);
    const testUrl = (slug: string) =>
      `https://contract-tests.example.com/${target().runId}/${slug}`;

    it('reports health', async () => {
      expect((await client().health()).status).toBe('ok');
    });

    // Needs samastur/hrcek#53 on the real server: until that lands,
    // POST /api/auth/tokens requires a session and this run fails, which
    // is the signal that the extension's flow is still blocked.
    it.skipIf(credentials === undefined)(
      'mints a working token from credentials, without expiry',
      async () => {
        const { identifier, password } = credentials!;
        const name = `contract test ${target().runId.slice(0, 8)}`;

        const created = await new HrcekClient(target().baseUrl, null).createToken(
          name,
          identifier,
          password,
        );

        expect(created.name).toBe(name);
        expect(created.expires_at).toBeNull();
        // The point of the exercise: the new token authenticates.
        const asNewToken = new HrcekClient(target().baseUrl, created.token);
        expect((await asNewToken.me()).email).toContain('@');
      },
    );

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
        .then(
          () => null,
          (e: { code?: string }) => e,
        );
      expect(error?.code).toBe('HRC-FIELD-0001');
    });

    it('upsert replaces notes/tags but patches fields', async () => {
      const url = testUrl('upsert-semantics');
      const first = await client().saveEntry({
        url,
        title: 'first',
        notes: 'original notes',
        tags: ['a', 'b'],
        fields: { price: '10' },
      });
      expect(first.status).toBe('created');
      expect(first.entry.fields.Price).toBe('10');

      // Second save omits notes/tags/fields entirely except title.
      const second = await client().saveEntry({ url, title: 'second' });
      expect(second.status).toBe('updated');
      expect(second.entry.id).toBe(first.entry.id);
      expect(second.entry.notes).toBe(''); // replaced (omitted -> cleared)
      expect(second.entry.tags).toEqual([]); // replaced (omitted -> cleared)
      expect(second.entry.fields.Price).toBe('10'); // patched -> survives
    });

    it('clears a field by submitting an empty string', async () => {
      const url = testUrl('clear-field');
      const created = await client().saveEntry({ url, fields: { price: '5' } });
      expect(created.entry.fields.Price).toBe('5');

      const cleared = await client().saveEntry({ url, fields: { price: '' } });
      expect(cleared.entry.fields.Price).toBeUndefined();
    });

    it('agrees with the client on address normalization when matching for update', async () => {
      // target() mints a fresh runId per call — capture it once so both
      // requests below address the same entry.
      const runId = target().runId;
      const first = await client().saveEntry({
        url: `https://contract-tests.example.com/${runId}/norm`,
      });
      expect(first.status).toBe('created');

      const variant = `  HTTPS://Contract-Tests.example.com/${runId}/norm  `;
      const second = await client().saveEntry({ url: variant });
      expect(second.status).toBe('updated');
      expect(second.entry.id).toBe(first.entry.id);
    });
  });
}
