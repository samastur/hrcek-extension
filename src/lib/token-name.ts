/** ApiToken.NAME_MAX_LENGTH on the server. */
export const MAX_TOKEN_NAME_LENGTH = 50;

const BROWSERS: Record<string, string> = {
  firefox: 'Firefox',
  chrome: 'Chrome',
  edge: 'Edge',
  opera: 'Opera',
  safari: 'Safari',
};

const OPERATING_SYSTEMS: Record<string, string> = {
  mac: 'macOS',
  win: 'Windows',
  linux: 'Linux',
  android: 'Android',
  openbsd: 'OpenBSD',
};

/**
 * A name the owner will recognise months later in the clients list at
 * /accounts/me/clients/ — which client, on which machine.
 */
export function tokenName(browser: string, os: string | null): string {
  const client = BROWSERS[browser] ?? browser;
  const where = os === null ? null : (OPERATING_SYSTEMS[os] ?? os);
  const name =
    where === null
      ? `Hrček extension (${client})`
      : `Hrček extension (${client} on ${where})`;
  return name.slice(0, MAX_TOKEN_NAME_LENGTH);
}
