import { HrcekClient } from './api/client';
import type { Settings } from './settings';

/**
 * `acceptLanguage` is the resolved locale, not the stored choice: the
 * choice may be null (Automatic), and the server should be asked in
 * whatever language the person is actually being shown.
 */
export function clientFromSettings(
  settings: Settings,
  acceptLanguage?: string,
): HrcekClient {
  return new HrcekClient(settings.serverUrl, settings.token, undefined, {
    ...(acceptLanguage === undefined ? {} : { acceptLanguage }),
  });
}

/** For calls that carry their own credentials, such as minting a token. */
export function anonymousClient(serverUrl: string, acceptLanguage?: string): HrcekClient {
  return new HrcekClient(serverUrl, null, undefined, {
    ...(acceptLanguage === undefined ? {} : { acceptLanguage }),
  });
}
