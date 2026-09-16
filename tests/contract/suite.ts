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
        .then(
          () => null,
          (e: { code?: string }) => e,
        );
      expect(error?.code).toBe('HRC-FIELD-0001');
    });
  });
}
