import { SessionAuth, TokenAuth, type AuthStrategy } from './api/auth';
import { HrcekClient } from './api/client';
import { csrfTokenGetter } from './platform/cookies';
import type { Settings } from './settings';

export function authForSettings(settings: Settings): AuthStrategy {
  return settings.authMode === 'token'
    ? new TokenAuth(settings.token ?? '')
    : new SessionAuth(csrfTokenGetter(settings.serverUrl));
}

export function clientFromSettings(settings: Settings): HrcekClient {
  return new HrcekClient(settings.serverUrl, authForSettings(settings));
}
