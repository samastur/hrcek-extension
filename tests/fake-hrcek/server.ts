// A small in-memory Hrček good enough for e2e and contract tests.
// Behavior mirrors ../hrcek/docs/dev/api.md; responses are typed against
// the generated schema so the fake cannot quietly drift from it.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { EntryOut, HealthOut, UserOut } from '../../src/lib/api/types';

export const FAKE_TOKEN = 'hrcek_test_token';
export const FAKE_IDENTIFIER = 'nina@example.com';
export const FAKE_PASSWORD = 'correct horse';
export const FAKE_USER: UserOut = { email: 'nina@example.com', display_name: null };

const SESSION_ID = 'fake-session';
const CSRF_TOKEN = 'fake-csrf';

/** A fresh Hrček account's default fields. */
const ACCOUNT_FIELDS = [
  { name: 'Price', kind: 'number' as const },
  { name: 'Priority', kind: 'choice' as const, choices: ['high', 'medium', 'low'] },
];

export interface FakeHrcek {
  url: string;
  reset(): void;
  close(): Promise<void>;
}

interface ErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}

function errorBody(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): ErrorBody {
  return { error: { code, message, details } };
}

/** Whitespace trimmed, scheme and host lowercased — and nothing else. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/]*)(.*)$/.exec(trimmed);
  if (match === null) return trimmed;
  return `${match[1]!.toLowerCase()}://${match[2]!.toLowerCase()}${match[3]!}`;
}

function isValidUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** "129.00" -> "129", "38.50" -> "38.5" — the way it was most likely typed. */
function normalizeNumber(value: string): string {
  return String(Number(value));
}

export async function startFakeHrcek(port = 0): Promise<FakeHrcek> {
  let entries = new Map<string, EntryOut>();
  let nextId = 1;
  let clock = 0;

  function timestamp(): string {
    clock += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString();
  }

  function json(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  function parseCookies(req: http.IncomingMessage): Record<string, string> {
    const header = req.headers.cookie ?? '';
    const cookies: Record<string, string> = {};
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name) cookies[name] = rest.join('=');
    }
    return cookies;
  }

  /** Returns null when authenticated; an error response description otherwise. */
  function checkAuth(
    req: http.IncomingMessage,
  ): { status: number; body: ErrorBody } | null {
    const auth = req.headers.authorization ?? '';
    if (auth === `Bearer ${FAKE_TOKEN}`) return null;
    const cookies = parseCookies(req);
    if (cookies['sessionid'] === SESSION_ID) {
      const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET');
      if (unsafe && req.headers['x-csrftoken'] !== cookies['csrftoken']) {
        return {
          status: 403,
          body: errorBody('HRC-AUTH-0005', 'CSRF check failed.'),
        };
      }
      return null;
    }
    return {
      status: 401,
      body: errorBody('HRC-AUTH-0003', 'You must sign in to do that.'),
    };
  }

  function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => (data += chunk.toString()));
      req.on('end', () => {
        try {
          resolve(data.length > 0 ? JSON.parse(data) : {});
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  /** Returns the updated fields or an error. Implements patch semantics. */
  function applyFields(
    current: Record<string, string>,
    submitted: Record<string, unknown>,
  ): { fields: Record<string, string> } | { status: number; body: ErrorBody } {
    const result = { ...current };
    for (const [rawName, rawValue] of Object.entries(submitted)) {
      const definition = ACCOUNT_FIELDS.find(
        (field) => field.name.toLowerCase() === rawName.trim().toLowerCase(),
      );
      if (definition === undefined) {
        return {
          status: 422,
          body: errorBody('HRC-FIELD-0001', 'There is no field with that name.', {
            field: rawName,
          }),
        };
      }
      const value = String(rawValue);
      if (value === '') {
        delete result[definition.name];
        continue;
      }
      if (definition.kind === 'number' && Number.isNaN(Number(value))) {
        return {
          status: 422,
          body: errorBody('HRC-CORE-0002', 'The submitted data is not valid.', {
            fields: { [definition.name]: ['This field takes a number.'] },
          }),
        };
      }
      if (definition.kind === 'choice' && !definition.choices.includes(value)) {
        return {
          status: 422,
          body: errorBody('HRC-CORE-0002', 'The submitted data is not valid.', {
            fields: {
              [definition.name]: [
                `This field must be one of: ${definition.choices.join(', ')}.`,
              ],
            },
          }),
        };
      }
      result[definition.name] =
        definition.kind === 'number' ? normalizeNumber(value) : value;
    }
    return { fields: result };
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      const requestUrl = new URL(req.url ?? '/', 'http://localhost');
      const route = `${req.method} ${requestUrl.pathname}`;

      if (route === 'POST /__reset') {
        entries = new Map();
        nextId = 1;
        res.writeHead(204).end();
        return;
      }

      if (route === 'GET /api/health') {
        const body: HealthOut = {
          status: 'ok',
          service: 'fake-hrcek',
          version: '0.0.0',
          message: 'Service is running.',
        };
        return json(res, 200, body);
      }

      if (route === 'POST /api/auth/login') {
        const body = (await readBody(req)) as {
          identifier?: string;
          password?: string;
        };
        if (body.identifier !== FAKE_IDENTIFIER || body.password !== FAKE_PASSWORD) {
          return json(res, 401, errorBody('HRC-AUTH-0001', 'Invalid credentials.'));
        }
        res.setHeader('Set-Cookie', [
          `sessionid=${SESSION_ID}; Path=/`,
          `csrftoken=${CSRF_TOKEN}; Path=/`,
        ]);
        return json(res, 200, FAKE_USER);
      }

      // GET / stands in for any page that makes Django set the CSRF cookie.
      if (route === 'GET /') {
        res.setHeader('Set-Cookie', [`csrftoken=${CSRF_TOKEN}; Path=/`]);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html>fake hrcek</html>');
      }

      const authError = checkAuth(req);
      if (authError !== null) return json(res, authError.status, authError.body);

      if (route === 'GET /api/auth/me') {
        return json(res, 200, FAKE_USER);
      }

      if (route === 'GET /api/entries/by-url/') {
        const url = requestUrl.searchParams.get('url') ?? '';
        const entry = entries.get(normalizeUrl(url));
        if (entry === undefined) {
          return json(
            res,
            404,
            errorBody('HRC-CORE-0003', 'The requested resource does not exist.', {
              url,
            }),
          );
        }
        return json(res, 200, entry);
      }

      if (route === 'POST /api/entries/') {
        const body = (await readBody(req)) as {
          url?: string;
          title?: string;
          notes?: string;
          tags?: string[];
          fields?: Record<string, unknown> | null;
        };
        if (typeof body.url !== 'string' || !isValidUrl(body.url)) {
          return json(
            res,
            422,
            errorBody('HRC-CORE-0002', 'The submitted data is not valid.', {
              fields: { url: ['Enter a valid URL.'] },
            }),
          );
        }
        const key = normalizeUrl(body.url);
        const existing = entries.get(key);
        const applied = applyFields(existing?.fields ?? {}, body.fields ?? {});
        if ('status' in applied) return json(res, applied.status, applied.body);

        const now = timestamp();
        const entry: EntryOut = {
          id: existing?.id ?? nextId++,
          url: key,
          title: body.title ?? '',
          notes: body.notes ?? '',
          tags: [...(body.tags ?? [])].sort(),
          fields: applied.fields,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        entries.set(key, entry);
        return json(res, existing === undefined ? 201 : 200, entry);
      }

      return json(
        res,
        404,
        errorBody('HRC-CORE-0003', 'The requested resource does not exist.'),
      );
    })().catch(() => {
      json(res, 500, errorBody('HRC-CORE-0001', 'Something went wrong.'));
    });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    reset() {
      entries = new Map();
      nextId = 1;
    },
    close() {
      return new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
