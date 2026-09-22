/** Long enough to spare the server, short enough to notice a website edit. */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/** A browsing session's worth of addresses. */
export const CACHE_LIMIT = 500;

export interface SavedState {
  /** true held, false not held, null could not be asked. */
  get(url: string): Promise<boolean | null>;
  /** Record an answer already known — a save just made, say. */
  mark(url: string, held: boolean): void;
}

interface Entry {
  held: boolean;
  at: number;
}

export function createSavedState(options: {
  look(url: string): Promise<boolean>;
  now(): number;
}): SavedState {
  // Insertion-ordered, which is what makes "evict the oldest" a shift.
  // In memory, not storage: a stale answer surviving a browser restart is
  // worse than asking again.
  const cache = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<boolean | null>>();

  function remember(url: string, held: boolean): void {
    cache.delete(url);
    cache.set(url, { held, at: options.now() });
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  return {
    async get(url: string): Promise<boolean | null> {
      const cached = cache.get(url);
      if (cached !== undefined && options.now() - cached.at < CACHE_TTL_MS) {
        return cached.held;
      }
      // Two tabs on the same address should cost one request, not two.
      const pending = inFlight.get(url);
      if (pending !== undefined) return pending;

      const request = options
        .look(url)
        .then(
          (held) => {
            remember(url, held);
            return held;
          },
          () => {
            // Not remembered: a failure must not harden into an answer.
            return null;
          },
        )
        .finally(() => inFlight.delete(url));

      inFlight.set(url, request);
      return request;
    },

    mark(url: string, held: boolean): void {
      remember(url, held);
    },
  };
}
