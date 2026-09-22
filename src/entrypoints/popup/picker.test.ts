// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createPicker } from './picker';
import type { Candidate } from '../../lib/page/candidates';

const CANDIDATES: Candidate[] = [
  { url: 'https://e.test/og.jpg', width: 0, height: 0, fromHead: true },
  { url: 'https://e.test/a.jpg', width: 800, height: 600, fromHead: false },
  { url: 'https://e.test/b.jpg', width: 400, height: 300, fromHead: false },
];

function mount(candidates = CANDIDATES, held: string | null = null) {
  const host = document.createElement('div');
  document.body.append(host);
  const picker = createPicker(host, { candidates, held });
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
    const { host, picker } = mount(CANDIDATES, 'https://e.test/held.jpg');
    expect(host.querySelector('.hero')).toBeNull();
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
  });

  it('offers none as the first tile, so clearing is the same gesture as choosing', () => {
    const { host, picker } = mount(CANDIDATES, 'https://e.test/held.jpg');
    host.querySelector<HTMLButtonElement>('.tile.none')!.click();
    expect(picker.choice()).toEqual({ kind: 'none' });
  });

  it('reports unchanged when the held picture is chosen again', () => {
    const { host, picker } = mount(CANDIDATES, 'https://e.test/held.jpg');
    host.querySelector<HTMLButtonElement>('.tile.none')!.click();
    host.querySelector<HTMLButtonElement>('.tile.held')!.click();
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
  });

  it('renders nothing at all when the page offered no picture and none is held', () => {
    const { host, picker } = mount([], null);
    expect(host.innerHTML).toBe('');
    expect(picker.choice()).toEqual({ kind: 'unchanged' });
  });
});
