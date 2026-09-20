import { HrcekClient } from './api/client';
import type { Settings } from './settings';

export function clientFromSettings(settings: Settings): HrcekClient {
  return new HrcekClient(settings.serverUrl, settings.token);
}

/** For calls that carry their own credentials, such as minting a token. */
export function anonymousClient(serverUrl: string): HrcekClient {
  return new HrcekClient(serverUrl, null);
}
