import { describe, expect, it } from 'vitest';
import { emptyForm, entryToForm, formToSaveRequest, parseTags } from './form';
import type { EntryOut } from '../../lib/api/types';

describe('parseTags', () => {
  it('splits on commas, trims, and drops empties', () => {
    expect(parseTags(' watches, diving ,,  ')).toEqual(['watches', 'diving']);
    expect(parseTags('')).toEqual([]);
  });
});

describe('entryToForm', () => {
  it('maps an existing entry into editable form state', () => {
    const entry: EntryOut = {
      id: 1,
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['diving', 'watches'],
      fields: { Price: '129', Priority: 'high' },
      image: null,
      created_at: '2026-09-13T12:28:12.937Z',
      updated_at: '2026-09-13T12:28:12.937Z',
    };

    expect(entryToForm(entry)).toEqual({
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: 'diving, watches',
      fields: [
        { name: 'Price', value: '129' },
        { name: 'Priority', value: 'high' },
      ],
    });
  });
});

describe('formToSaveRequest', () => {
  it('collects the form into a SaveRequest', () => {
    const request = formToSaveRequest({
      url: ' https://example.com/watch ',
      title: ' A watch ',
      notes: '38mm',
      tags: 'watches, diving',
      fields: [
        { name: ' price ', value: '129.00' },
        { name: '', value: 'ignored — no name' },
      ],
    });

    expect(request).toEqual({
      url: 'https://example.com/watch',
      title: 'A watch',
      notes: '38mm',
      tags: ['watches', 'diving'],
      fields: { price: '129.00' },
    });
  });

  it('keeps an emptied value so the server clears that field', () => {
    const request = formToSaveRequest({
      ...emptyForm('https://example.com/watch', ''),
      fields: [{ name: 'Price', value: '' }],
    });

    expect(request.fields).toEqual({ Price: '' });
  });
});
