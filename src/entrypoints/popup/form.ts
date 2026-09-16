import type { EntryOut } from '../../lib/api/types';
import type { SaveRequest } from '../../lib/save';

export interface FormState {
  url: string;
  title: string;
  notes: string;
  /** Comma-separated, as typed. */
  tags: string;
  fields: Array<{ name: string; value: string }>;
}

export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function emptyForm(url: string, title: string): FormState {
  return { url, title, notes: '', tags: '', fields: [] };
}

export function entryToForm(entry: EntryOut): FormState {
  return {
    url: entry.url,
    title: entry.title,
    notes: entry.notes,
    tags: entry.tags.join(', '),
    fields: Object.entries(entry.fields).map(([name, value]) => ({ name, value })),
  };
}

export function formToSaveRequest(form: FormState): SaveRequest {
  const fields: Record<string, string> = {};
  for (const { name, value } of form.fields) {
    const trimmed = name.trim();
    // An empty VALUE is kept: that is how the API clears a field.
    if (trimmed.length > 0) fields[trimmed] = value;
  }
  return {
    url: form.url.trim(),
    title: form.title.trim(),
    notes: form.notes,
    tags: parseTags(form.tags),
    fields,
  };
}
