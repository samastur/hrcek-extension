import type { Candidate } from '../../lib/page/candidates';
import type { PictureChoice } from '../../lib/picture';

export interface PickerOptions {
  candidates: Candidate[];
  /** The address of the picture the entry already holds, if any. */
  held: string | null;
}

export interface Picker {
  choice(): PictureChoice;
}

/** How many tiles the strip shows at once. */
const WINDOW = 4;

export function createPicker(host: HTMLElement, options: PickerOptions): Picker {
  const { candidates, held } = options;

  // Nothing to offer and nothing to drop: the row is simply absent.
  if (candidates.length === 0 && held === null) {
    host.innerHTML = '';
    return { choice: () => ({ kind: 'unchanged' }) };
  }

  /** null means "no picture"; the held address means "leave it alone". */
  let selected: string | null = held ?? candidates[0]?.url ?? null;
  // A picture already held counts as a choice already made, so it opens
  // collapsed on what it holds. A fresh page opens on its proposal.
  let expanded = held === null;
  let start = 0;

  type Tile = { key: string; url: string | null; className: string; label: string };

  function tiles(): Tile[] {
    const list: Tile[] = [
      { key: 'none', url: null, className: 'tile none', label: 'No picture' },
    ];
    if (held !== null) {
      list.push({
        key: held,
        url: held,
        className: 'tile held',
        label: 'The picture it has',
      });
    }
    for (const candidate of candidates) {
      if (candidate.url === held) continue;
      list.push({
        key: candidate.url,
        url: candidate.url,
        className: 'tile',
        label: candidate.fromHead ? 'Declared by the page' : 'From the page',
      });
    }
    return list;
  }

  function render(): void {
    const all = tiles();
    const windowed = all.slice(start, start + WINDOW);
    const hero =
      expanded && selected !== null
        ? `<img class="hero" src="${selected}" alt="" />`
        : expanded
          ? '<div class="hero empty">No picture</div>'
          : '';

    host.innerHTML = `
      ${hero}
      <div class="strip">
        <button type="button" class="step" data-step="-1" ${start === 0 ? 'disabled' : ''} aria-label="Earlier pictures">‹</button>
        <div class="tiles"></div>
        <button type="button" class="step" data-step="1" ${start + WINDOW >= all.length ? 'disabled' : ''} aria-label="More pictures">›</button>
        ${expanded ? '' : '<button type="button" class="expand quiet" aria-label="Show the picture larger">⤢</button>'}
      </div>
    `;

    const box = host.querySelector<HTMLDivElement>('.tiles')!;
    for (const tile of windowed) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        tile.className + (tile.key === (selected ?? 'none') ? ' on' : '');
      button.title = tile.label;
      button.setAttribute('aria-label', tile.label);
      if (tile.url === null) {
        button.textContent = 'none';
      } else {
        const image = document.createElement('img');
        image.src = tile.url;
        image.alt = '';
        button.append(image);
      }
      button.addEventListener('click', () => {
        selected = tile.url;
        // Choosing is the moment the hero has done its job.
        expanded = false;
        render();
      });
      box.append(button);
    }

    for (const step of host.querySelectorAll<HTMLButtonElement>('.step')) {
      step.addEventListener('click', () => {
        start = Math.max(
          0,
          Math.min(all.length - 1, start + Number(step.dataset['step']) * WINDOW),
        );
        render();
      });
    }

    host.querySelector<HTMLButtonElement>('.expand')?.addEventListener('click', () => {
      expanded = true;
      render();
    });
  }

  render();

  return {
    choice(): PictureChoice {
      if (selected === null) {
        // Nothing to clear if there was nothing there.
        return held === null ? { kind: 'unchanged' } : { kind: 'none' };
      }
      // Leaving the held picture selected must send no image_url at all.
      if (selected === held) return { kind: 'unchanged' };
      return { kind: 'url', url: selected };
    },
  };
}
