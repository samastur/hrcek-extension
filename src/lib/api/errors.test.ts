import { describe, expect, it } from 'vitest';
import { errorFromResponse, HrcekApiError } from './errors';

describe('errorFromResponse', () => {
  it('parses the Hrček error envelope', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: 'HRC-AUTH-0003',
          message: 'You must sign in to do that.',
          details: {},
        },
      }),
      { status: 401 },
    );

    const error = await errorFromResponse(response);

    expect(error).toBeInstanceOf(HrcekApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('HRC-AUTH-0003');
    expect(error.message).toBe('You must sign in to do that.');
    expect(error.details).toEqual({});
  });

  it('keeps machine-readable details', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: 'HRC-FIELD-0001',
          message: 'There is no field with that name.',
          details: { field: 'colour' },
        },
      }),
      { status: 422 },
    );

    const error = await errorFromResponse(response);

    expect(error.details).toEqual({ field: 'colour' });
  });

  it('survives a non-JSON body (proxy error page)', async () => {
    const response = new Response('<html>502 Bad Gateway</html>', { status: 502 });

    const error = await errorFromResponse(response);

    expect(error.status).toBe(502);
    expect(error.code).toBe('HRC-CLIENT-UNPARSEABLE');
  });
});
