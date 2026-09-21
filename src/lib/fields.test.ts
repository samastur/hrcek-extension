import { describe, expect, it } from 'vitest';
import { buildFieldInputs, fieldsForRequest } from './fields';
import type { FieldOut } from './api/types';

const DEFINITIONS: FieldOut[] = [
  { name: 'Price', kind: 'number', options: [] },
  { name: 'Priority', kind: 'choice', options: ['high', 'medium', 'low'] },
];

describe('buildFieldInputs', () => {
  it('offers every defined field, with the entry values filled in', () => {
    expect(buildFieldInputs(DEFINITIONS, { Price: '129' })).toEqual([
      { name: 'Price', kind: 'number', options: [], value: '129' },
      { name: 'Priority', kind: 'choice', options: ['high', 'medium', 'low'], value: '' },
    ]);
  });

  it('matches the entry value without regard to case, as the server does', () => {
    const [price] = buildFieldInputs(DEFINITIONS, { price: '129' });
    expect(price!.value).toBe('129');
  });

  it('falls back to the entry’s own keys when the definitions could not be read', () => {
    // The server’s spelling of the name is what came back on the entry,
    // and it is the key to write back.
    expect(buildFieldInputs(null, { Price: '129', Colour: 'red' })).toEqual([
      { name: 'Colour', kind: 'text', options: [], value: 'red' },
      { name: 'Price', kind: 'text', options: [], value: '129' },
    ]);
  });

  it('offers nothing when there are neither definitions nor values', () => {
    expect(buildFieldInputs(null, {})).toEqual([]);
  });
});

describe('fieldsForRequest', () => {
  it('sends every rendered field, clearing the empty ones with an empty string', () => {
    const inputs = buildFieldInputs(DEFINITIONS, { Price: '129' });
    // fields is PATCHED, so a field left out keeps its old value. An
    // emptied input has to say so out loud.
    expect(fieldsForRequest(inputs)).toEqual({ Price: '129', Priority: '' });
  });

  it('never invents a field that was not rendered', () => {
    // A form that guessed at names could clear a value it never showed.
    expect(fieldsForRequest([])).toEqual({});
  });

  it('trims the value but leaves the name as the server spelled it', () => {
    expect(
      fieldsForRequest([{ name: 'Price', kind: 'number', options: [], value: ' 129 ' }]),
    ).toEqual({ Price: '129' });
  });
});
