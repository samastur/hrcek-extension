import { describe, expect, it, vi } from 'vitest';
import { CACHE_LIMIT, CACHE_TTL_MS, createSavedState } from './saved-state';

function harness(answers: (url: string) => Promise<boolean>) {
  let clock = 0;
  const look = vi.fn(answers);
  const state = createSavedState({ look, now: () => clock });
  return { state, look, tick: (ms: number) => (clock += ms) };
}

describe('createSavedState', () => {
  it('asks once and then answers from the cache', async () => {
    const { state, look } = harness(async () => true);
    expect(await state.get('https://e.test/a')).toBe(true);
    expect(await state.get('https://e.test/a')).toBe(true);
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
    expect(await state.get('https://e.test/a')).toBe(false);
    await state.get('https://e.test/a');
    expect(look).toHaveBeenCalledOnce();
  });

  it('answers null when the lookup failed, and does not remember it', async () => {
    // "We could not ask" is not "you have not saved it". An icon that
    // guesses is worse than one that abstains.
    const { state, look } = harness(async () => {
      throw new Error('offline');
    });
    expect(await state.get('https://e.test/a')).toBeNull();
    expect(await state.get('https://e.test/a')).toBeNull();
    expect(look).toHaveBeenCalledTimes(2);
  });

  it('takes a mark without asking, so a save shows at once', async () => {
    const { state, look } = harness(async () => false);
    state.mark('https://e.test/a', true);
    expect(await state.get('https://e.test/a')).toBe(true);
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
});
