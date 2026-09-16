import type { AuthStrategy } from './auth';
import { errorFromResponse, HrcekNetworkError } from './errors';
import type { EntryIn, EntryOut, HealthOut, UserOut } from './types';

export type SaveResult = { status: 'created' | 'updated'; entry: EntryOut };

/** Thin typed wrapper over the Hrček HTTP API. */
export class HrcekClient {
  constructor(
    /** e.g. "https://hrcek.example.com" — no trailing slash. */
    private readonly baseUrl: string,
    private readonly auth: AuthStrategy,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  async health(): Promise<HealthOut> {
    return (await this.request('GET', '/api/health')).json();
  }

  async me(): Promise<UserOut> {
    return (await this.request('GET', '/api/auth/me')).json();
  }

  async login(identifier: string, password: string): Promise<UserOut> {
    const response = await this.request('POST', '/api/auth/login', {
      identifier,
      password,
    });
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

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(await this.auth.headers(method)),
    };
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        credentials: this.auth.credentials,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new HrcekNetworkError(`Could not reach ${this.baseUrl}.`, { cause });
    }
    if (!response.ok) throw await errorFromResponse(response);
    return response;
  }
}
