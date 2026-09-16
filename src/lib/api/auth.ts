/** How requests authenticate. The client is agnostic of the mode. */
export interface AuthStrategy {
  headers(method: string): Promise<Record<string, string>>;
  readonly credentials: RequestCredentials;
}

export class TokenAuth implements AuthStrategy {
  readonly credentials = 'omit';

  constructor(private readonly token: string) {}

  async headers(_method: string): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${this.token}` };
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Session-cookie auth. Unsafe requests need Django's CSRF token; where it
 * comes from (browser.cookies) is injected so this stays browser-free.
 */
export class SessionAuth implements AuthStrategy {
  readonly credentials = 'include';

  constructor(private readonly getCsrfToken: () => Promise<string | null>) {}

  async headers(method: string): Promise<Record<string, string>> {
    if (!UNSAFE_METHODS.has(method.toUpperCase())) return {};
    const token = await this.getCsrfToken();
    return token === null ? {} : { 'X-CSRFToken': token };
  }
}
