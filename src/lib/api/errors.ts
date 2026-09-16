/** The stable Hrček error envelope: {"error": {"code", "message", "details"}}. */
interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}

/** A failure the server reported. Branch on `code`, never on `message`. */
export class HrcekApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HrcekApiError';
  }
}

/** The server could not be reached at all. */
export class HrcekNetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HrcekNetworkError';
  }
}

export async function errorFromResponse(response: Response): Promise<HrcekApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new HrcekApiError(
      response.status,
      body.error.code,
      body.error.message,
      body.error.details ?? {},
    );
  } catch {
    // Not the envelope — e.g. a reverse proxy's HTML error page.
    return new HrcekApiError(
      response.status,
      'HRC-CLIENT-UNPARSEABLE',
      `The server answered ${response.status} with an unreadable body.`,
    );
  }
}
