import type { StateStore } from './platform/session-store';

/** Long enough to spare the server, short enough to notice a website edit. */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/** A browsing session's worth of addresses. */
export const CACHE_LIMIT = 500;

/** What is known about an address. */
export type Answer = 'held' | 'not-held' | 'unknown' | 'unauthorized';

export interface SavedState {
  /** What is known, asking the server when the cache cannot say. */
  get(url: string): Promise<Answer>;
  /** Record an answer already known — a save just made, say. */
  mark(url: string, held: boolean): void;
  /** Forget everything, including a refusal. For a settings change. */
  reset(): void;
}

export interface Entry {
  held: boolean;
  at: number;
}

export function createSavedState(options: {
  look(url: string): Promise<boolean>;
  now(): number;
  /** Which failures mean "the token is no good", not "not just now". */
  isUnauthorized?(error: unknown): boolean;
  /** Where answers outlive this context. Absent means memory only. */
  store?: StateStore;
}): SavedState {
  // Insertion-ordered, which is what makes "evict the oldest" a shift.
  // In memory, not storage: a stale answer surviving a browser restart is
  // worse than asking again.
  const cache = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<Answer>>();
  // Latched, not cached per address: a refused token refuses every
  // address, and asking once per tab would be a request a minute that
  // cannot succeed. Cleared by reset(), which a settings change calls.
  let unauthorized = false;

  // Read once per context, not per lookup: this is a worker that may
  // have just started, not a cache that changes underneath us.
  let hydrated: Promise<void> | null = null;
  function hydrate(): Promise<void> {
    if (hydrated === null) {
      hydrated =
        options.store === undefined
          ? Promise.resolve()
          : options.store.read().then((entries) => {
              for (const [url, entry] of Object.entries(entries)) {
                // Anything learned since the read wins: it is newer.
                if (!cache.has(url)) cache.set(url, entry);
              }
            });
    }
    return hydrated;
  }

  function remember(url: string, held: boolean): void {
    cache.delete(url);
    cache.set(url, { held, at: options.now() });
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    // Write-through, fire and forget: a lost write costs one request.
    void options.store?.write(Object.fromEntries(cache));
  }

  return {
    async get(url: string): Promise<Answer> {
      await hydrate();
      if (unauthorized) return 'unauthorized';
      const cached = cache.get(url);
      if (cached !== undefined && options.now() - cached.at < CACHE_TTL_MS) {
        return cached.held ? 'held' : 'not-held';
      }
      // Two tabs on the same address should cost one request, not two.
      const pending = inFlight.get(url);
      if (pending !== undefined) return pending;

      const request = options
        .look(url)
        .then(
          (held): Answer => {
            remember(url, held);
            return held ? 'held' : 'not-held';
          },
          (error: unknown): Answer => {
            // Not remembered: a failure must not harden into an answer.
            if (options.isUnauthorized?.(error) === true) {
              unauthorized = true;
              return 'unauthorized';
            }
            return 'unknown';
          },
        )
        .finally(() => inFlight.delete(url));

      inFlight.set(url, request);
      return request;
    },

    mark(url: string, held: boolean): void {
      remember(url, held);
    },

    reset(): void {
      unauthorized = false;
      cache.clear();
      hydrated = null;
      void options.store?.write({});
    },
  };
}
