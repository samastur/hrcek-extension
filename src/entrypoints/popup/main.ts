import { browser } from 'wxt/browser';
import { HrcekApiError, HrcekNetworkError } from '../../lib/api/errors';
import { clientFromSettings } from '../../lib/client-factory';
import { loadExisting, submitSave } from '../../lib/save';
import { loadSettings } from '../../lib/settings';
import { emptyForm, entryToForm, formToSaveRequest, type FormState } from './form';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** e2e seam: ?url=&title= override the active-tab lookup. */
async function getPageInfo(): Promise<{ url: string; title: string }> {
  const params = new URLSearchParams(window.location.search);
  const urlOverride = params.get('url');
  if (urlOverride !== null) {
    return { url: urlOverride, title: params.get('title') ?? '' };
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return { url: tab?.url ?? '', title: tab?.title ?? '' };
}

function setStatus(kind: 'info' | 'success' | 'error', text: string): void {
  const status = document.querySelector<HTMLParagraphElement>('#status')!;
  status.dataset.kind = kind;
  status.textContent = text;
}

function messageFor(error: unknown): string {
  // The server's message is translated and made for people — show it.
  if (error instanceof HrcekApiError) return error.message;
  if (error instanceof HrcekNetworkError) return error.message;
  return 'Something went wrong.';
}

function fieldRow(name: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'field-row';
  row.innerHTML = `
    <input class="field-name" placeholder="Field" />
    <input class="field-value" placeholder="Value" />
  `;
  row.querySelector<HTMLInputElement>('.field-name')!.value = name;
  row.querySelector<HTMLInputElement>('.field-value')!.value = value;
  return row;
}

function renderUnconfigured(): void {
  app.innerHTML = `
    <p>Hrček is not configured yet.</p>
    <button id="open-options">Open settings</button>
  `;
  document
    .querySelector<HTMLButtonElement>('#open-options')!
    .addEventListener('click', () => browser.runtime.openOptionsPage());
}

function renderForm(form: FormState, existing: boolean): void {
  app.innerHTML = `
    <form id="entry-form">
      ${existing ? '<p id="existing-note">Already saved — editing the existing entry.</p>' : ''}
      <label>Address <input id="url" required /></label>
      <label>Title <input id="title" /></label>
      <label>Notes <textarea id="notes" rows="3"></textarea></label>
      <label>Tags <input id="tags" placeholder="comma, separated" /></label>
      <div id="fields"></div>
      <button type="button" id="add-field">Add field</button>
      <button type="submit" id="save">Save</button>
      <p id="status" data-kind="info"></p>
    </form>
  `;
  document.querySelector<HTMLInputElement>('#url')!.value = form.url;
  document.querySelector<HTMLInputElement>('#title')!.value = form.title;
  document.querySelector<HTMLTextAreaElement>('#notes')!.value = form.notes;
  document.querySelector<HTMLInputElement>('#tags')!.value = form.tags;
  const fieldsBox = document.querySelector<HTMLDivElement>('#fields')!;
  for (const { name, value } of form.fields) {
    fieldsBox.append(fieldRow(name, value));
  }

  document
    .querySelector<HTMLButtonElement>('#add-field')!
    .addEventListener('click', () => fieldsBox.append(fieldRow('', '')));

  document
    .querySelector<HTMLFormElement>('#entry-form')!
    .addEventListener('submit', (event) => {
      event.preventDefault();
      void save();
    });
}

function collectForm(): FormState {
  return {
    url: document.querySelector<HTMLInputElement>('#url')!.value,
    title: document.querySelector<HTMLInputElement>('#title')!.value,
    notes: document.querySelector<HTMLTextAreaElement>('#notes')!.value,
    tags: document.querySelector<HTMLInputElement>('#tags')!.value,
    fields: [...document.querySelectorAll<HTMLDivElement>('.field-row')].map((row) => ({
      name: row.querySelector<HTMLInputElement>('.field-name')!.value,
      value: row.querySelector<HTMLInputElement>('.field-value')!.value,
    })),
  };
}

async function save(): Promise<void> {
  const settings = (await loadSettings())!;
  const client = clientFromSettings(settings);
  setStatus('info', 'Saving…');
  try {
    const outcome = await submitSave(client, formToSaveRequest(collectForm()));
    setStatus('success', outcome.status === 'created' ? 'Saved.' : 'Updated.');
  } catch (error) {
    setStatus('error', messageFor(error));
  }
}

async function main(): Promise<void> {
  const settings = await loadSettings();
  if (settings === null) {
    renderUnconfigured();
    return;
  }
  const { url, title } = await getPageInfo();
  const client = clientFromSettings(settings);
  try {
    const existing = url.length > 0 ? await loadExisting(client, url) : null;
    if (existing !== null) {
      renderForm(entryToForm(existing), true);
    } else {
      renderForm(emptyForm(url, title), false);
    }
  } catch (error) {
    renderForm(emptyForm(url, title), false);
    setStatus('error', messageFor(error));
  }
}

void main();
