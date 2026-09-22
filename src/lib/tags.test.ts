import { describe, expect, it } from 'vitest';
import { addTag, normalizeTag, removeTag, sameTag, suggestionsFor } from './tags';

describe('normalizeTag', () => {
  it('trims, and nothing else', () => {
    expect(normalizeTag('  watches  ')).toBe('watches');
    // Capitals are the owner's business; only the comparison ignores them.
    expect(normalizeTag('Watches')).toBe('Watches');
  });
});

describe('sameTag', () => {
  it('ignores capitals, because the server cannot hold two that differ only so', () => {
    expect(sameTag('Watches', 'watches')).toBe(true);
    expect(sameTag('watches', 'water')).toBe(false);
  });
});

describe('addTag', () => {
  it('appends a tag', () => {
    expect(addTag(['diving'], 'watches')).toEqual(['diving', 'watches']);
  });

  it('refuses a duplicate whatever its capitals', () => {
    expect(addTag(['Watches'], 'watches')).toEqual(['Watches']);
  });

  it('refuses blank input', () => {
    expect(addTag(['diving'], '   ')).toEqual(['diving']);
  });
});

describe('removeTag', () => {
  it('removes by name, ignoring capitals', () => {
    expect(removeTag(['Watches', 'diving'], 'watches')).toEqual(['diving']);
  });
});

describe('suggestionsFor', () => {
  it('never offers a tag the entry already carries', () => {
    // The duplicate is prevented by not offering it, rather than by
    // rejecting it after the fact.
    expect(suggestionsFor(['watches', 'water'], ['Watches'])).toEqual(['water']);
  });
});
