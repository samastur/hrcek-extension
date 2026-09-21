import { browser } from 'wxt/browser';
import { HrcekApiError, HrcekNetworkError } from '../../lib/api/errors';
import { HrcekClient } from '../../lib/api/client';
import { clientFromSettings } from '../../lib/client-factory';
import { loadExisting, submitSave } from '../../lib/save';
import { loadSettings } from '../../lib/settings';
import { emptyForm, entryToForm, formToSaveRequest, type FormState } from './form';
import type { Settings } from '../../lib/settings';
import type { FieldInput } from '../../lib/fields';
import type { FieldOut } from '../../lib/api/types';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

let settings: Settings | null = null;
let client: HrcekClient | null = null;
/** True when the initial look-before-write failed for a reason other than "not held". */
let lookupFailed = false;
let pageUrl = '';
/** What the <details> actually showed. Only these are ever sent back. */
let renderedFields: FieldInput[] = [];
/** Loaded once in main(); null when GET /api/fields/ could not be read. */
let definitions: FieldOut[] | null = null;

async function getPageInfo(): Promise<{ url: string; title: string }> {
  // e2e builds only: Playwright opens the popup as an ordinary tab, which
  // makes the popup itself the active tab, so ?url=&title= stand in for the
  // page under test. MODE is a build-time constant, so this branch is not in
  // production bundles.
  if (import.meta.env.MODE === 'e2e') {
    const params = new URLSearchParams(window.location.search);
    const urlOverride = params.get('url');
    if (urlOverride !== null) {
      return { url: urlOverride, title: params.get('title') ?? '' };
    }
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

function fieldControl(input: FieldInput): string {
  const id = `field-${encodeURIComponent(input.name)}`;
  if (input.kind === 'choice') {
    const options = ['', ...input.options]
      .map(
        (option) =>
          `<option value="${escapeAttribute(option)}"${option === input.value ? ' selected' : ''}>${
            option === '' ? '—' : escapeText(option)
          }</option>`,
      )
      .join('');
    return `<select id="${id}" data-field="${escapeAttribute(input.name)}">${options}</select>`;
  }
  // A number field still takes a string: values come back as strings
  // always, and the server does the validating.
  const mode = input.kind === 'number' ? ' inputmode="decimal"' : '';
  return `<input id="${id}" data-field="${escapeAttribute(input.name)}"${mode} value="${escapeAttribute(input.value)}" />`;
}

function escapeText(value: string): string {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function fieldsMarkup(inputs: FieldInput[]): string {
  if (inputs.length === 0) return '';
  const rows = inputs
    .map(
      (input) =>
        `<div class="field"><label for="field-${encodeURIComponent(input.name)}">${escapeText(
          input.name,
        )}</label>${fieldControl(input)}</div>`,
    )
    .join('');
  // Closed by default: these are optional, and most saves never touch them.
  return `<details id="fields"><summary>Your fields</summary><div class="field-body">${rows}</div></details>`;
}

function renderUnconfigured(): void {
  app.innerHTML = `
    <div class="hrcek-header">
      <img src="/icon/32.png" alt="" />
      <span class="name">Hrček</span>
    </div>
    <p>Hrček is not configured yet.</p>
    <button id="open-options">Open settings</button>
  `;
  document
    .querySelector<HTMLButtonElement>('#open-options')!
    .addEventListener('click', () => browser.runtime.openOptionsPage());
}

function renderForm(form: FormState, existing: boolean): void {
  renderedFields = form.fields;
  app.innerHTML = `
    <div class="hrcek-header">
      <img src="/icon/32.png" alt="" />
      <span class="name">Hrček</span>
      ${existing ? '<span class="aside">Already saved</span>' : ''}
    </div>
    <span class="address" id="address" title=""></span>
    <form id="entry-form">
      <div class="field"><label for="title">Title</label><input id="title" /></div>
      <div class="field"><label for="notes">Notes</label><textarea id="notes" rows="3"></textarea></div>
      <div class="field"><label for="tags">Tags</label><input id="tags" placeholder="comma, separated" /></div>
      ${fieldsMarkup(form.fields)}
      <button type="submit" id="save">${existing ? 'Update' : 'Save'}</button>
      <p id="status" data-kind="info"></p>
    </form>
  `;
  const address = document.querySelector<HTMLSpanElement>('#address')!;
  address.textContent = form.url;
  address.title = form.url;
  document.querySelector<HTMLInputElement>('#title')!.value = form.title;
  document.querySelector<HTMLTextAreaElement>('#notes')!.value = form.notes;
  document.querySelector<HTMLInputElement>('#tags')!.value = form.tags;

  document
    .querySelector<HTMLFormElement>('#entry-form')!
    .addEventListener('submit', (event) => {
      event.preventDefault();
      void save();
    });
}

function collectForm(): FormState {
  return {
    // Not editable, so it is carried rather than read back from an input.
    url: pageUrl,
    title: document.querySelector<HTMLInputElement>('#title')!.value,
    notes: document.querySelector<HTMLTextAreaElement>('#notes')!.value,
    tags: document.querySelector<HTMLInputElement>('#tags')!.value,
    fields: [
      ...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]'),
    ].map((control) => {
      const rendered = renderedFields.find(
        (field) => field.name === control.dataset['field'],
      )!;
      return { ...rendered, value: control.value };
    }),
  };
}

async function save(): Promise<void> {
  if (!settings || !client) {
    setStatus('error', 'Settings not available.');
    return;
  }
  setStatus('info', 'Saving…');

  // The initial look-before-write failed (network blip, 5xx — not a
  // confirmed "not held"). Posting now could blind-replace a held entry's
  // notes/tags, so re-check before writing anything.
  if (lookupFailed) {
    try {
      const existing = pageUrl.length > 0 ? await loadExisting(client, pageUrl) : null;
      if (existing !== null) {
        lookupFailed = false;
        renderForm(entryToForm(existing, definitions), true);
        setStatus(
          'error',
          'This address is already saved. Review the existing entry, then save again.',
        );
        return;
      }
      lookupFailed = false;
    } catch (error) {
      setStatus('error', messageFor(error));
      return;
    }
  }

  try {
    const outcome = await submitSave(client, formToSaveRequest(collectForm()));
    setStatus('success', outcome.status === 'created' ? 'Saved.' : 'Updated.');
  } catch (error) {
    setStatus('error', messageFor(error));
  }
}

async function main(): Promise<void> {
  settings = await loadSettings();
  if (settings === null) {
    renderUnconfigured();
    return;
  }
  client = clientFromSettings(settings);
  const { url, title } = await getPageInfo();
  pageUrl = url;
  // Not fatal: without them the form falls back to the entry's own keys,
  // which is enough to show and re-send what the entry already holds.
  definitions = await client.listFields().then(
    (fields) => fields,
    () => null,
  );
  try {
    const existing = url.length > 0 ? await loadExisting(client, url) : null;
    if (existing !== null) {
      renderForm(entryToForm(existing, definitions), true);
    } else {
      renderForm(emptyForm(url, title, definitions), false);
    }
  } catch (error) {
    lookupFailed = true;
    renderForm(emptyForm(url, title, definitions), false);
    setStatus('error', messageFor(error));
  }
}

void main();
