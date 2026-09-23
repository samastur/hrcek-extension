/**
 * Says on the page what the popup would have said, because the popup is
 * about to close itself. Injected on demand when a save finishes — not
 * registered, because the extension has no business running on every
 * page you load.
 *
 * It answers a message rather than a return value, and with
 * `sendResponse` + `return true` rather than a Promise: Chrome discards
 * a Promise returned from `onMessage`. Same contract as `harvest.ts`.
 */
const HOST_ID = '__hrcek-toast';

/** Long enough to read; an error is longer, because there is more of it. */
const LINGER_MS = { success: 3000, error: 6000 };

/** The website's tokens, inlined: a shadow root inherits no stylesheet. */
const STYLE = `
  :host { all: initial; }
  .toast {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    max-width: 22rem;
    box-sizing: border-box;
    padding: 0.6rem 0.8rem;
    border-radius: 0.4375rem;
    border: 1px solid #e4dfd5;
    background: #ffffff;
    color: #292521;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    box-shadow: 0 6px 24px rgb(0 0 0 / 18%);
    opacity: 0;
    transition: opacity 150ms ease-out;
  }
  .toast.in { opacity: 1; }
  .toast.error { border-color: #b3261c; color: #b3261c; }
  @media (prefers-color-scheme: dark) {
    .toast { background: #211e1a; color: #e9e4dc; border-color: #3b352c; }
    .toast.error { border-color: #ef8983; color: #ef8983; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast { transition: none; opacity: 1; }
  }
`;

interface ToastMessage {
  type?: string;
  text?: string;
  kind?: 'success' | 'error';
}

export default defineUnlistedScript(() => {
  const flag = '__hrcekToastReady';
  const scope = window as unknown as Record<string, unknown>;
  // Injected on every save; a second listener would draw every toast twice.
  if (scope[flag] === true) return;
  scope[flag] = true;

  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(text: string, kind: 'success' | 'error'): void {
    clearTimeout(timer);
    // On documentElement, not body: a page that restyles or replaces its
    // body cannot take the toast with it.
    let host = document.getElementById(HOST_ID);
    if (host === null) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.attachShadow({ mode: 'open' });
      document.documentElement.append(host);
    }
    const root = host.shadowRoot!;
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = STYLE;
    const box = document.createElement('div');
    box.className = kind === 'error' ? 'toast error' : 'toast';
    box.setAttribute('role', 'status');
    // textContent, never innerHTML: this is a message, not markup.
    box.textContent = text;
    root.append(style, box);
    // Next frame, so the transition has a state to start from.
    requestAnimationFrame(() => box.classList.add('in'));

    timer = setTimeout(() => {
      document.getElementById(HOST_ID)?.remove();
    }, LINGER_MS[kind]);
  }

  browser.runtime.onMessage.addListener(
    (message: unknown, _sender: unknown, sendResponse: (response: unknown) => void) => {
      const incoming = message as ToastMessage;
      // Not ours: answer undefined synchronously, leaving the message to
      // whatever else is listening.
      if (incoming.type !== 'hrcek:toast') return undefined;
      show(incoming.text ?? '', incoming.kind === 'error' ? 'error' : 'success');
      sendResponse({ shown: true });
      return true;
    },
  );
});
