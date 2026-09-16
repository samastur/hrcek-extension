import { browser } from 'wxt/browser';
import { HrcekApiError, HrcekNetworkError } from '../../lib/api/errors';
import { clientFromSettings } from '../../lib/client-factory';
import {
  loadSettings,
  normalizeServerUrl,
  saveSettings,
  type AuthMode,
} from '../../lib/settings';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Hrček settings</h1>
  <form id="settings-form">
    <label>Server address
      <input id="server-url" type="url" placeholder="https://hrcek.example.com" required />
    </label>
    <fieldset>
      <legend>Sign in with</legend>
      <label><input type="radio" name="mode" id="mode-token" value="token" checked />
        API token (recommended)</label>
      <label><input type="radio" name="mode" id="mode-session" value="session" />
        Email/name and password</label>
    </fieldset>
    <div id="token-section">
      <label>API token
        <input id="token" type="password" placeholder="hrcek_…" autocomplete="off" />
      </label>
      <p>Create one on <a id="account-link" href="#" target="_blank">your account page</a>.</p>
    </div>
    <div id="session-section" hidden>
      <label>Email or display name <input id="identifier" autocomplete="username" /></label>
      <label>Password
        <input id="password" type="password" autocomplete="current-password" />
      </label>
      <p>The password is used once to sign in and never stored. You will be
         asked again when the session expires.</p>
    </div>
    <button type="submit" id="save">Save</button>
    <button type="button" id="test">Test connection</button>
    <p id="status" data-kind="info"></p>
  </form>
`;

const serverUrlInput = document.querySelector<HTMLInputElement>('#server-url')!;
const tokenInput = document.querySelector<HTMLInputElement>('#token')!;
const identifierInput = document.querySelector<HTMLInputElement>('#identifier')!;
const passwordInput = document.querySelector<HTMLInputElement>('#password')!;
const modeToken = document.querySelector<HTMLInputElement>('#mode-token')!;
const modeSession = document.querySelector<HTMLInputElement>('#mode-session')!;
const tokenSection = document.querySelector<HTMLDivElement>('#token-section')!;
const sessionSection = document.querySelector<HTMLDivElement>('#session-section')!;
const accountLink = document.querySelector<HTMLAnchorElement>('#account-link')!;

function setStatus(kind: 'info' | 'success' | 'error', text: string): void {
  const status = document.querySelector<HTMLParagraphElement>('#status')!;
  status.dataset.kind = kind;
  status.textContent = text;
}

function messageFor(error: unknown): string {
  if (error instanceof HrcekApiError) return error.message;
  if (error instanceof HrcekNetworkError) return error.message;
  return 'Something went wrong.';
}

function currentMode(): AuthMode {
  return modeSession.checked ? 'session' : 'token';
}

function syncSections(): void {
  tokenSection.hidden = currentMode() !== 'token';
  sessionSection.hidden = currentMode() !== 'session';
}
modeToken.addEventListener('change', syncSections);
modeSession.addEventListener('change', syncSections);

serverUrlInput.addEventListener('change', () => {
  accountLink.href = `${normalizeServerUrl(serverUrlInput.value)}/accounts/me/`;
});

/** The manifest holds no host permissions; ask for this server's origin. */
async function requestOriginPermission(serverUrl: string): Promise<boolean> {
  try {
    const origin = `${new URL(serverUrl).origin}/*`;
    return await browser.permissions.request({ origins: [origin] });
  } catch {
    // e.g. malformed URL or not called from a user gesture; the save itself will surface it.
    return false;
  }
}

document
  .querySelector<HTMLFormElement>('#settings-form')!
  .addEventListener('submit', (event) => {
    event.preventDefault();
    void save();
  });

async function save(): Promise<void> {
  const serverUrl = normalizeServerUrl(serverUrlInput.value);
  const mode = currentMode();
  setStatus('info', 'Saving…');

  try {
    const granted = await requestOriginPermission(serverUrl);

    const settings = {
      serverUrl,
      authMode: mode,
      token: mode === 'token' ? tokenInput.value.trim() : null,
    };
    await saveSettings(settings);

    if (mode === 'session' && passwordInput.value.length > 0) {
      const user = await clientFromSettings(settings).login(
        identifierInput.value.trim(),
        passwordInput.value,
      );
      passwordInput.value = ''; // used once, never kept
      setStatus('success', `Saved. Signed in as ${user.email}.`);
      return;
    }

    setStatus(
      'success',
      granted ? 'Saved.' : 'Saved. Grant site access when asked on first save.',
    );
  } catch (error) {
    setStatus('error', messageFor(error));
  }
}

document.querySelector<HTMLButtonElement>('#test')!.addEventListener('click', () => {
  void testConnection();
});

async function testConnection(): Promise<void> {
  const settings = await loadSettings();
  if (settings === null) {
    setStatus('error', 'Save the settings first.');
    return;
  }
  setStatus('info', 'Testing…');
  try {
    const user = await clientFromSettings(settings).me();
    setStatus('success', `Connected as ${user.email}.`);
  } catch (error) {
    setStatus('error', messageFor(error));
  }
}

async function restore(): Promise<void> {
  const settings = await loadSettings();
  if (settings === null) return;
  serverUrlInput.value = settings.serverUrl;
  accountLink.href = `${settings.serverUrl}/accounts/me/`;
  if (settings.authMode === 'session') {
    modeSession.checked = true;
  } else {
    tokenInput.value = settings.token ?? '';
  }
  syncSections();
}

void restore();
