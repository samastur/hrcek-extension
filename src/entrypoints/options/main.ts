import { browser } from 'wxt/browser';
import { HrcekApiError, HrcekNetworkError } from '../../lib/api/errors';
import { anonymousClient, clientFromSettings } from '../../lib/client-factory';
import { loadSettings, normalizeServerUrl, saveSettings } from '../../lib/settings';
import { tokenName } from '../../lib/token-name';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="hrcek-header">
    <img src="/icon/32.png" alt="" />
    <span class="name">Hrček</span>
  </div>
  <h1>Settings</h1>
  <form id="settings-form">
    <div class="field">
      <label for="server-url">Server address</label>
      <input id="server-url" type="url" placeholder="https://hrcek.example.com" required />
    </div>
    <div class="field">
      <label for="token">API token</label>
      <input id="token" type="password" placeholder="hrcek_…" autocomplete="off" />
    </div>
    <div class="field">
      <label for="show-saved"><input type="checkbox" id="show-saved" /> Show whether a page is already saved</label>
      <p>The toolbar ticks the hamster on pages you have saved. Doing so
         asks your Hrček about every address you visit. Turn it off and the
         toolbar only says whether the extension is configured.</p>
    </div>
    <p>Paste one from <a id="account-link" href="#" target="_blank">your clients page</a>,
       or let Hrček make one below.</p>
    <button type="submit" id="save">Save</button>
    <button type="button" class="quiet" id="test">Test connection</button>
    <p id="status" data-kind="info"></p>
  </form>

  <details id="create-token" open>
    <summary>Create a token with your password</summary>
    <p>Your password is used once to ask Hrček for a token, and is never
       stored. The token appears above and is what the extension uses from
       then on.</p>
    <div class="field">
      <label for="identifier">Email or display name</label>
      <input id="identifier" autocomplete="username" />
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" />
    </div>
    <button type="button" id="create">Create token</button>
  </details>
`;

const serverUrlInput = document.querySelector<HTMLInputElement>('#server-url')!;
const tokenInput = document.querySelector<HTMLInputElement>('#token')!;
const identifierInput = document.querySelector<HTMLInputElement>('#identifier')!;
const passwordInput = document.querySelector<HTMLInputElement>('#password')!;
const accountLink = document.querySelector<HTMLAnchorElement>('#account-link')!;
const showSavedInput = document.querySelector<HTMLInputElement>('#show-saved')!;
// A first visit has no stored settings, so restore() never runs; default on.
showSavedInput.checked = true;

function setStatus(kind: 'info' | 'success' | 'error', text: string): void {
  const status = document.querySelector<HTMLParagraphElement>('#status')!;
  status.dataset.kind = kind;
  status.textContent = text;
}

function messageFor(error: unknown): string {
  if (error instanceof HrcekApiError) {
    // Rate-limited, ten an hour by default. The throttle's reply is not
    // the Hrček error envelope, so the status is all there is to go on.
    if (error.status === 429) {
      return 'Too many attempts. Wait a while before trying again, or paste a token from your clients page.';
    }
    // An older Hrček has no exchange route; its 404 says nothing useful.
    if (error.status === 404) {
      return 'This Hrček cannot make tokens for an extension. Create one on your clients page and paste it above.';
    }
    return error.message;
  }
  if (error instanceof HrcekNetworkError) return error.message;
  return 'Something went wrong.';
}

serverUrlInput.addEventListener('change', () => {
  accountLink.href = `${normalizeServerUrl(serverUrlInput.value)}/accounts/me/clients/`;
});

/** The manifest holds no host permissions; ask for this server's origin. */
async function requestOriginPermission(serverUrl: string): Promise<boolean> {
  try {
    const origin = `${new URL(serverUrl).origin}/*`;
    return await browser.permissions.request({ origins: [origin] });
  } catch {
    // A malformed address, or no user gesture — the save itself reports it.
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
  setStatus('info', 'Saving…');
  try {
    const serverUrl = normalizeServerUrl(serverUrlInput.value);
    const granted = await requestOriginPermission(serverUrl);
    const token = tokenInput.value.trim();
    await saveSettings({
      serverUrl,
      token: token.length > 0 ? token : null,
      showSavedState: showSavedInput.checked,
    });
    setStatus(
      'success',
      granted
        ? 'Saved.'
        : 'Saved. Site access was declined — press Save again to grant it.',
    );
  } catch (error) {
    setStatus('error', messageFor(error));
  }
}

document.querySelector<HTMLButtonElement>('#create')!.addEventListener('click', () => {
  void createToken();
});

/** Where this token will show up in the owner's clients list. */
async function nameForThisClient(): Promise<string> {
  try {
    const { os } = await browser.runtime.getPlatformInfo();
    return tokenName(import.meta.env.BROWSER, os);
  } catch {
    return tokenName(import.meta.env.BROWSER, null);
  }
}

async function createToken(): Promise<void> {
  setStatus('info', 'Asking Hrček for a token…');
  try {
    const serverUrl = normalizeServerUrl(serverUrlInput.value);
    await requestOriginPermission(serverUrl);
    const name = await nameForThisClient();
    const created = await anonymousClient(serverUrl).createToken(
      name,
      identifierInput.value.trim(),
      passwordInput.value,
    );
    passwordInput.value = ''; // used once, never kept
    tokenInput.value = created.token;
    await saveSettings({
      serverUrl,
      token: created.token,
      showSavedState: showSavedInput.checked,
    });
    setStatus('success', `Saved. Token created as "${created.name}".`);
  } catch (error) {
    setStatus('error', messageFor(error));
  }
}

document.querySelector<HTMLButtonElement>('#test')!.addEventListener('click', () => {
  void testConnection();
});

async function testConnection(): Promise<void> {
  const settings = await loadSettings();
  if (settings === null || settings.token === null) {
    setStatus('error', 'Save a server address and token first.');
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
  accountLink.href = `${settings.serverUrl}/accounts/me/clients/`;
  tokenInput.value = settings.token ?? '';
  showSavedInput.checked = settings.showSavedState;
  // Minting is the first-run path; once a token is held, fold it away.
  if (settings.token !== null) {
    document.querySelector<HTMLDetailsElement>('#create-token')!.open = false;
  }
}

void restore();
