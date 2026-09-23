// @vitest-environment jsdom
// Not colocated: every file directly under src/entrypoints/ is an
// entrypoint to WXT, so a toast.test.ts beside toast.ts would be built
// and shipped inside the zip.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import toast from '../../src/entrypoints/toast';

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => unknown;

function inject(): Listener[] {
  const listeners: Listener[] = [];
  vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener').mockImplementation(
    (listener: unknown) => {
      listeners.push(listener as Listener);
    },
  );
  toast.main!();
  return listeners;
}

function shadow(): ShadowRoot | null {
  return document.getElementById('__hrcek-toast')?.shadowRoot ?? null;
}

describe('the toast script', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>)['__hrcekToastReady'];
    document.getElementById('__hrcek-toast')?.remove();
    document.body.innerHTML = '';
  });

  it('shows the text it was sent, inside a shadow root no page CSS can reach', () => {
    const [listener] = inject();
    const sendResponse = vi.fn();

    const answer = listener!(
      { type: 'hrcek:toast', text: 'Saved.', kind: 'success' },
      {},
      sendResponse,
    );

    // sendResponse + `return true`: Chrome discards a returned Promise.
    expect(answer).toBe(true);
    expect(sendResponse).toHaveBeenCalledTimes(1);
    expect(shadow()!.textContent).toContain('Saved.');
  });

  it('shows the server’s words as text, never as markup', () => {
    // The message is translated server-side and passes through the
    // popup; it is content, not HTML.
    const [listener] = inject();
    listener!(
      { type: 'hrcek:toast', text: '<img src=x onerror=alert(1)>', kind: 'error' },
      {},
      vi.fn(),
    );

    expect(shadow()!.querySelector('img')).toBeNull();
    expect(shadow()!.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('replaces the toast already showing rather than stacking a second', () => {
    const [listener] = inject();
    listener!({ type: 'hrcek:toast', text: 'Saved.', kind: 'success' }, {}, vi.fn());
    listener!({ type: 'hrcek:toast', text: 'Updated.', kind: 'success' }, {}, vi.fn());

    expect(document.querySelectorAll('#__hrcek-toast')).toHaveLength(1);
    expect(shadow()!.textContent).toContain('Updated.');
    expect(shadow()!.textContent).not.toContain('Saved.');
  });

  it('takes itself away, and gives an error longer to be read', () => {
    vi.useFakeTimers();
    const [listener] = inject();

    listener!({ type: 'hrcek:toast', text: 'Saved.', kind: 'success' }, {}, vi.fn());
    vi.advanceTimersByTime(3100);
    expect(document.getElementById('__hrcek-toast')).toBeNull();

    listener!({ type: 'hrcek:toast', text: 'Trouble.', kind: 'error' }, {}, vi.fn());
    vi.advanceTimersByTime(3100);
    expect(document.getElementById('__hrcek-toast')).not.toBeNull();
    vi.advanceTimersByTime(3000);
    expect(document.getElementById('__hrcek-toast')).toBeNull();
  });

  it('leaves a message of another type alone, answering undefined synchronously', () => {
    const [listener] = inject();
    const sendResponse = vi.fn();

    expect(listener!({ type: 'something:else' }, {}, sendResponse)).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('adds one listener however often it is injected', () => {
    const listeners = inject();
    toast.main!();

    expect(listeners).toHaveLength(1);
  });
});
