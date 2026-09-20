import { errorFromResponse, HrcekNetworkError } from './errors';
import type { EntryIn, EntryOut, HealthOut, TokenOut, UserOut } from './types';

export type SaveResult = { status: 'created' | 'updated'; entry: EntryOut };

/** Thin typed wrapper over the Hrček HTTP API. */
export class HrcekClient {
  constructor(
    /** e.g. "https://hrcek.example.com" — no trailing slash. */
    private readonly baseUrl: string,
    /** Bearer token, or null when only anonymous calls are needed. */
    private readonly token: string | null,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  async health(): Promise<HealthOut> {
    return (await this.request('GET', '/api/health')).json();
  }

  async me(): Promise<UserOut> {
    return (await this.request('GET', '/api/auth/me')).json();
  }

  /**
   * Trade credentials for a bearer token. Deliberately anonymous: the
   * server refuses to mint a token for a request that presents one, so a
   * token that leaked could not issue its own replacement.
   */
  async createToken(
    name: string,
    identifier: string,
    password: string,
  ): Promise<TokenOut> {
    // No expires_at: the extension's token should keep working.
    const response = await this.request(
      'POST',
      '/api/auth/tokens',
      { name, identifier, password },
      { anonymous: true },
    );
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
    options: { anonymous?: boolean } = {},
  ): Promise<Response> {
    const authenticated = !options.anonymous && this.token !== null;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(authenticated ? { Authorization: `Bearer ${this.token}` } : {}),
    };
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        // Cookies are never used: session auth cannot pass Django's CSRF
        // origin check from an extension, so bearer tokens are the only
        // credential this client understands.
        credentials: 'omit',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new HrcekNetworkError(`Could not reach ${this.baseUrl}.`, { cause });
    }
    if (!response.ok) throw await errorFromResponse(response);
    return response;
  }
}
