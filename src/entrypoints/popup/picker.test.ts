// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createPicker, type HeldPicture } from './picker';
import type { Candidate } from '../../lib/page/candidates';

const CANDIDATES: Candidate[] = [
  { url: 'https://e.test/og.jpg', width: 0, height: 0, fromHead: true },
  { url: 'https://e.test/a.jpg', width: 800, height: 600, fromHead: false },
  { url: 'https://e.test/b.jpg', width: 400, height: 300, fromHead: false },
];

/** What main.ts hands over: an object URL over bytes fetched with the token. */
const HELD: HeldPicture = { src: 'blob:held-picture' };

function mount(
  candidates = CANDIDATES,
  held: HeldPicture | null = null,
  existing = held !== null,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const picker = createPicker(host, { candidates, held, existing });
  return { host, picker };
}

describe('createPicker', () => {
  it('preselects the first candidate, so the common case is one click on Save', () => {
    const { picker } = mount();
    expect(picker.choice()).toEqual({ kind: 'url', url: 'https://e.test/og.jpg' });
  });

  it('opens expanded while the choice is still the one proposed', () => {
    const { host } = mount();
    expect(host.querySelector('.hero')).not.toBeNull();
  });

  it('collapses once a choice is made', () => {
    const { host } = mount();
    host.querySelectorAll<HTMLButtonElement>('.tile')[2]!.click();
    expect(host.querySelector('.hero')).toBeNull();
  });

  it('re-opens when the strip is clicked again', () => {
    const { host } = mount();
    host.querySelectorAll<HTMLButtonElement>('.tile')[2]!.click();
    host.querySelector<HTMLButtonElement>('.expand')!.click();
    expect(host.querySelector('.hero')).not.toBeNull();
  });

  it('opens collapsed on an entry that already holds a picture', () => {
    // A picture already held counts as a choice already made.
    const { host, picker } = mount(CANDIDATES, HELD);
    expect(host.querySelector('.hero')).toBeNull();
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
  });

  it('offers none as the first tile, so clearing is the same gesture as choosing', () => {
    const { host, picker } = mount(CANDIDATES, HELD);
    host.querySelector<HTMLButtonElement>('.tile.none')!.click();
    expect(picker.choice()).toEqual({ kind: 'none' });
  });

  it('reports unchanged when the held picture is chosen again', () => {
    const { host, picker } = mount(CANDIDATES, HELD);
    host.querySelector<HTMLButtonElement>('.tile.none')!.click();
    host.querySelector<HTMLButtonElement>('.tile.held')!.click();
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
  });

  it('leaves an entry that has no picture without one, however loudly the page offers', () => {
    // Reopening a saved entry to fix a typo must not attach the page's
    // og:image behind your back. Preselecting is for a page not yet saved.
    const { host, picker } = mount(CANDIDATES, null, true);
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
    // Nothing is proposed, so nothing opens large; "no picture" is the
    // tile already on.
    expect(host.querySelector('.hero')).toBeNull();
    expect(host.querySelector('.tile.none')!.className).toContain('on');
  });

  it('still offers that entry the page’s pictures, one click away', () => {
    const { host, picker } = mount(CANDIDATES, null, true);
    host.querySelectorAll<HTMLButtonElement>('.tile')[1]!.click();
    expect(picker.choice()).toEqual({ kind: 'url', url: 'https://e.test/og.jpg' });
  });

  it('shows the held picture from the bytes it was given, not from its address', () => {
    // The entry's own image address answers only to the owning account,
    // and an <img> cannot present a token — so what arrives here is an
    // object URL over bytes already fetched.
    const { host } = mount(CANDIDATES, HELD);
    const tile = host.querySelector<HTMLButtonElement>('.tile.held')!;
    expect(tile.querySelector('img')!.getAttribute('src')).toBe('blob:held-picture');
  });

  it('says the entry has a picture even when its bytes could not be fetched', () => {
    // Better than an <img> that can only ever render broken — and the
    // choice to keep or drop it still works.
    const { host, picker } = mount(CANDIDATES, { src: null });
    const tile = host.querySelector<HTMLButtonElement>('.tile.held')!;
    expect(tile.querySelector('img')).toBeNull();
    expect(tile.textContent).toBe('kept');
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
    host.querySelector<HTMLButtonElement>('.tile.none')!.click();
    expect(picker.choice()).toEqual({ kind: 'none' });
  });

  it('renders nothing at all when the page offered no picture and none is held', () => {
    const { host, picker } = mount([], null);
    expect(host.innerHTML).toBe('');
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
  });

  it('builds the hero as an element, so a candidate address cannot break out of markup', () => {
    // A page controls its own candidate addresses. A literal quote must not
    // let one escape an attribute and plant a new one (like onerror=...).
    const hostile: Candidate[] = [
      {
        url: 'https://e.test/x.jpg" onerror="alert(1)',
        width: 800,
        height: 600,
        fromHead: false,
      },
    ];
    const { host } = mount(hostile, null);
    const heroes = host.querySelectorAll<HTMLImageElement>('.hero');
    expect(heroes).toHaveLength(1);
    // The attribute carries exactly the given string — nothing was parsed
    // out of it, because it was never parsed as markup at all.
    expect(heroes[0]!.getAttribute('src')).toBe(hostile[0]!.url);
    expect(heroes[0]!.getAttribute('onerror')).toBeNull();
    // No stray element was smuggled in alongside the hero and its own tile
    // thumbnail — exactly the two <img>s this page's one candidate can make.
    expect(host.querySelectorAll('img')).toHaveLength(2);
    expect(host.querySelectorAll('[onerror]')).toHaveLength(0);
  });

  it('pages through the strip, sliding the window and toggling the arrows at the ends', () => {
    const many: Candidate[] = Array.from({ length: 6 }, (_, index) => ({
      url: `https://e.test/${index}.jpg`,
      width: 800,
      height: 600,
      fromHead: false,
    }));
    const { host } = mount(many, null);
    // 7 tiles total (none + 6 candidates), 4 shown at a time.
    const srcsOf = () =>
      [...host.querySelectorAll<HTMLImageElement>('.tile img')].map((image) =>
        image.getAttribute('src'),
      );
    expect(host.querySelectorAll('.tile')).toHaveLength(4);
    expect(srcsOf()).toEqual([
      'https://e.test/0.jpg',
      'https://e.test/1.jpg',
      'https://e.test/2.jpg',
    ]);
    const [earlier, more] = host.querySelectorAll<HTMLButtonElement>('.step');
    expect(earlier!.disabled).toBe(true);
    expect(more!.disabled).toBe(false);

    more!.click();

    expect(host.querySelectorAll('.tile')).toHaveLength(3);
    expect(srcsOf()).toEqual([
      'https://e.test/3.jpg',
      'https://e.test/4.jpg',
      'https://e.test/5.jpg',
    ]);
    const [earlierAfter, moreAfter] = host.querySelectorAll<HTMLButtonElement>('.step');
    expect(earlierAfter!.disabled).toBe(false);
    expect(moreAfter!.disabled).toBe(true);

    earlierAfter!.click();

    expect(srcsOf()).toEqual([
      'https://e.test/0.jpg',
      'https://e.test/1.jpg',
      'https://e.test/2.jpg',
    ]);
  });
});
