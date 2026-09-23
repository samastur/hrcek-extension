import { describe, expect, it, vi } from 'vitest';
import { HrcekApiError, HrcekNetworkError, isAuthFailure } from './api/errors';
import type { StateStore } from './platform/session-store';
import { CACHE_LIMIT, CACHE_TTL_MS, createSavedState, type Entry } from './saved-state';

function backedStore(initial: Record<string, Entry> = {}): StateStore {
  let backing = initial;
  return {
    read: async () => backing,
    write: async (entries) => {
      backing = entries;
    },
  };
}

function harness(answers: (url: string) => Promise<boolean>) {
  let clock = 0;
  const look = vi.fn(answers);
  const state = createSavedState({
    look,
    now: () => clock,
    isUnauthorized: isAuthFailure,
  });
  return { state, look, tick: (ms: number) => (clock += ms) };
}

describe('createSavedState', () => {
  it('asks once and then answers from the cache', async () => {
    const { state, look } = harness(async () => true);
    expect(await state.get('https://e.test/a')).toBe('held');
    expect(await state.get('https://e.test/a')).toBe('held');
    expect(look).toHaveBeenCalledOnce();
  });

  it('asks again once the answer has gone stale', async () => {
    const { state, look, tick } = harness(async () => true);
    await state.get('https://e.test/a');
    tick(CACHE_TTL_MS + 1);
    await state.get('https://e.test/a');
    expect(look).toHaveBeenCalledTimes(2);
  });

  it('remembers a "not held" answer too', async () => {
    const { state, look } = harness(async () => false);
    expect(await state.get('https://e.test/a')).toBe('not-held');
    await state.get('https://e.test/a');
    expect(look).toHaveBeenCalledOnce();
  });

  it('answers unknown when the lookup failed, and does not remember it', async () => {
    // "We could not ask" is not "you have not saved it". An icon that
    // guesses is worse than one that abstains.
    const { state, look } = harness(async () => {
      throw new Error('offline');
    });
    expect(await state.get('https://e.test/a')).toBe('unknown');
    expect(await state.get('https://e.test/a')).toBe('unknown');
    expect(look).toHaveBeenCalledTimes(2);
  });

  it('takes a mark without asking, so a save shows at once', async () => {
    const { state, look } = harness(async () => false);
    state.mark('https://e.test/a', true);
    expect(await state.get('https://e.test/a')).toBe('held');
    expect(look).not.toHaveBeenCalled();
  });

  it('shares one lookup between callers racing for the same address', async () => {
    const { state, look } = harness(async () => true);
    await Promise.all([state.get('https://e.test/a'), state.get('https://e.test/a')]);
    expect(look).toHaveBeenCalledOnce();
  });

  it('evicts the oldest once it is full', async () => {
    const { state, look } = harness(async () => true);
    for (let i = 0; i <= CACHE_LIMIT; i++) await state.get(`https://e.test/${i}`);
    look.mockClear();
    await state.get('https://e.test/0');
    expect(look).toHaveBeenCalledOnce();
  });

  it('tells a refused token apart from being unable to ask', async () => {
    const { state } = harness(async () => {
      throw new HrcekApiError(401, 'HRC-AUTH-0003', 'You must sign in to do that.');
    });

    expect(await state.get('https://example.com/a')).toBe('unauthorized');
  });

  it('stops asking once the token has been refused', async () => {
    // A dead token asked about once per tab is a dead token asked about
    // all day, and not one of those requests can succeed.
    const { state, look } = harness(async () => {
      throw new HrcekApiError(401, 'HRC-AUTH-0003', 'You must sign in to do that.');
    });

    await state.get('https://example.com/a');
    await state.get('https://example.com/b');

    expect(look).toHaveBeenCalledTimes(1);
    expect(await state.get('https://example.com/c')).toBe('unauthorized');
  });

  it('asks again after settings change', async () => {
    let refuse = true;
    const { state, look } = harness(async () => {
      if (refuse) throw new HrcekApiError(401, 'HRC-AUTH-0003', 'Sign in.');
      return true;
    });

    await state.get('https://example.com/a');
    refuse = false;
    state.reset();

    expect(await state.get('https://example.com/a')).toBe('held');
    expect(look).toHaveBeenCalledTimes(2);
  });

  it('keeps answering "unknown" for a blip, which is not an answer', async () => {
    const { state, look } = harness(async () => {
      throw new HrcekNetworkError('No route to host.');
    });

    expect(await state.get('https://example.com/a')).toBe('unknown');
    expect(await state.get('https://example.com/b')).toBe('unknown');
    // Not latched: "we could not ask" is not "your token is dead".
    expect(look).toHaveBeenCalledTimes(2);
  });

  it('finds what an earlier worker already asked', async () => {
    // Chrome kills the MV3 worker after 30 seconds idle. Without this,
    // every tab switch after a pause costs a request the server has
    // already answered.
    const store = backedStore();
    const first = createSavedState({ look: async () => true, now: () => 0, store });
    expect(await first.get('https://example.com/a')).toBe('held');

    // A new worker over the same session storage, and a look that would
    // throw if it were called at all.
    const look = vi.fn(async () => {
      throw new Error('should not ask again');
    });
    const second = createSavedState({ look, now: () => 1000, store });

    expect(await second.get('https://example.com/a')).toBe('held');
    expect(look).not.toHaveBeenCalled();
  });

  it('still lets a stored answer go stale', async () => {
    const store = backedStore({ 'https://example.com/a': { held: true, at: 0 } });
    const look = vi.fn(async () => false);
    const state = createSavedState({ look, now: () => CACHE_TTL_MS + 1, store });

    expect(await state.get('https://example.com/a')).toBe('not-held');
    expect(look).toHaveBeenCalledTimes(1);
  });

  it('does not let mark() as the first operation erase what an earlier worker cached', async () => {
    // Chrome can wake the worker specifically to deliver the "you just
    // saved this" message, so mark() — not get() — can be the very first
    // thing this context does. A write-through that fired before
    // hydration would replace the whole store with just that one entry.
    const store = backedStore({ 'https://example.com/old': { held: true, at: 0 } });
    const state = createSavedState({ look: async () => true, now: () => 0, store });

    state.mark('https://example.com/new', true);

    // Let the write-through's hydrate-then-write chain settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(await store.read()).toEqual({
      'https://example.com/old': { held: true, at: 0 },
      'https://example.com/new': { held: true, at: 0 },
    });
  });

  it('does not let a stale hydration resurrect entries a reset() already cleared', async () => {
    // A settings change can land while an earlier mark()'s hydrate-then-
    // write is still waiting on the store. That write must not undo the
    // reset by writing back what the (now stale) read saw.
    let releaseRead: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let backing: Record<string, Entry> = {
      'https://example.com/old': { held: true, at: 0 },
    };
    const writes: Record<string, Entry>[] = [];
    const store: StateStore = {
      read: async () => {
        // A real storage.session.get() effectively snapshots at the
        // moment it is called; only the promise settling is delayed.
        // Capturing here (not after the gate) is what makes this a
        // stale-read race rather than a same-value coincidence.
        const snapshot = backing;
        await gate;
        return snapshot;
      },
      write: async (entries) => {
        writes.push(entries);
        backing = entries;
      },
    };

    const state = createSavedState({ look: async () => true, now: () => 0, store });

    // Kicks off hydration (the read is still gated) and schedules a
    // write-through once it resolves.
    state.mark('https://example.com/new', true);
    // A settings change arrives before that read resolves.
    state.reset();

    releaseRead?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // reset()'s write of {} must be the last word — not resurrected by
    // the stale hydration completing afterwards.
    expect(writes[writes.length - 1]).toEqual({});
    expect(backing).toEqual({});
  });
});
