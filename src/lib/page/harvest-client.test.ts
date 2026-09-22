import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawCandidate } from './candidates';

const { injectFile, sendMessage } = vi.hoisted(() => ({
  injectFile: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../platform/inject', () => ({ injectFile }));
vi.mock('wxt/browser', () => ({ browser: { tabs: { sendMessage } } }));

const { harvestCandidates } = await import('./harvest-client');

describe('harvestCandidates', () => {
  beforeEach(() => {
    injectFile.mockReset();
    sendMessage.mockReset();
  });

  it('answers [] when injection rejects (a privileged page, a closed tab)', async () => {
    injectFile.mockRejectedValue(new Error('Cannot access a chrome:// URL'));

    expect(await harvestCandidates(1)).toEqual([]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('answers [] when sendMessage rejects (no listener on the other side)', async () => {
    injectFile.mockResolvedValue(undefined);
    sendMessage.mockRejectedValue(new Error('Could not establish connection'));

    expect(await harvestCandidates(1)).toEqual([]);
  });

  it('answers [] when the reply is undefined', async () => {
    injectFile.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue(undefined);

    expect(await harvestCandidates(1)).toEqual([]);
  });

  it('answers [] when the reply has no candidates key', async () => {
    injectFile.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue({});

    expect(await harvestCandidates(1)).toEqual([]);
  });

  it('answers [] when candidates is null', async () => {
    injectFile.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue({ candidates: null });

    expect(await harvestCandidates(1)).toEqual([]);
  });

  it('answers [] when candidates is not an array — the case the try/catch must keep catching', async () => {
    injectFile.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue({ candidates: 'not an array' });

    expect(await harvestCandidates(1)).toEqual([]);
  });

  it('ranks a well-formed reply rather than returning it raw', async () => {
    injectFile.mockResolvedValue(undefined);
    const raw: RawCandidate[] = [
      // Below MIN_DIMENSION: rankCandidates drops it. A raw pass-through
      // would keep it, so this proves the reply actually flows through
      // rankCandidates.
      { url: 'https://example.com/small.png', width: 10, height: 10, fromHead: false },
      { url: 'https://example.com/big.png', width: 800, height: 600, fromHead: false },
    ];
    sendMessage.mockResolvedValue({ candidates: raw });

    expect(await harvestCandidates(1)).toEqual([raw[1]]);
  });
});
