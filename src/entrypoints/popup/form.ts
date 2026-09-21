import { buildFieldInputs, fieldsForRequest, type FieldInput } from '../../lib/fields';
import type { EntryOut, FieldOut } from '../../lib/api/types';
import type { SaveRequest } from '../../lib/save';

export interface FormState {
  url: string;
  title: string;
  notes: string;
  /** Comma-separated, as typed. */
  tags: string;
  fields: FieldInput[];
}

export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function emptyForm(
  url: string,
  title: string,
  definitions: FieldOut[] | null,
): FormState {
  return { url, title, notes: '', tags: '', fields: buildFieldInputs(definitions, {}) };
}

export function entryToForm(entry: EntryOut, definitions: FieldOut[] | null): FormState {
  return {
    url: entry.url,
    title: entry.title,
    notes: entry.notes,
    tags: entry.tags.join(', '),
    fields: buildFieldInputs(definitions, entry.fields),
  };
}

export function formToSaveRequest(form: FormState): SaveRequest {
  return {
    url: form.url.trim(),
    title: form.title.trim(),
    notes: form.notes,
    tags: parseTags(form.tags),
    fields: fieldsForRequest(form.fields),
  };
}
