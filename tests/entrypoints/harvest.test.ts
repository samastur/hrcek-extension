// @vitest-environment jsdom
// Not colocated: every file directly under src/entrypoints/ is an
// entrypoint to WXT, so a harvest.test.ts beside harvest.ts would be
// built and shipped inside the zip.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import harvest from '../../src/entrypoints/harvest';
import type { RawCandidate } from '../../src/lib/page/candidates';

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => unknown;

/** Runs the injected script and hands back whatever it registered. */
function inject(): Listener[] {
  const listeners: Listener[] = [];
  vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener').mockImplementation(
    (listener: unknown) => {
      listeners.push(listener as Listener);
    },
  );
  harvest.main!();
  return listeners;
}

describe('the harvest script', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // The double-injection guard lives on the window, which jsdom keeps
    // for the whole file.
    delete (window as unknown as Record<string, unknown>)['__hrcekHarvestReady'];
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('answers with sendResponse and returns true, the one form both browsers understand', () => {
    // Chrome discards a Promise returned from onMessage: the channel
    // closes and the caller is handed undefined, which looks exactly like
    // a page with no pictures. This is the regression that hid the whole
    // picture feature on Chrome.
    document.head.innerHTML =
      '<meta property="og:image" content="https://example.com/og.jpg" />';
    const [listener] = inject();
    const sendResponse = vi.fn();

    const answer = listener!({ type: 'hrcek:harvest' }, {}, sendResponse);

    expect(answer).toBe(true);
    expect(sendResponse).toHaveBeenCalledTimes(1);
    const { candidates } = sendResponse.mock.calls[0]![0] as {
      candidates: RawCandidate[];
    };
    expect(candidates).toEqual([
      { url: 'https://example.com/og.jpg', width: 0, height: 0, fromHead: true },
    ]);
  });

  it('leaves a message of another type alone, answering undefined synchronously', () => {
    // Returning true here would hold the channel open for an answer that
    // never comes, and block whatever else is listening.
    const [listener] = inject();
    const sendResponse = vi.fn();

    expect(listener!({ type: 'something:else' }, {}, sendResponse)).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('adds one listener however often it is injected', () => {
    // The popup injects on every open; a second listener would answer
    // every message twice.
    const listeners = inject();
    harvest.main!();

    expect(listeners).toHaveLength(1);
  });
});
