import type { FieldOut } from './api/types';

/** One row of the form: a definition plus whatever the entry holds for it. */
export interface FieldInput {
  name: string;
  kind: FieldOut['kind'];
  options: string[];
  value: string;
}

function valueFor(entryFields: Record<string, string>, name: string): string {
  // Names match without regard to case, so `price`, `Price` and `PRICE`
  // are the same field — the server says so, and an entry saved by
  // another client may use any spelling.
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(entryFields)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return '';
}

/**
 * The inputs to render. `definitions` is null when GET /api/fields/
 * could not be read; the entry's own keys then stand in, so an existing
 * entry's values stay visible and — more to the point — stay sendable.
 * Guessing at names the form never showed is how values get cleared.
 */
export function buildFieldInputs(
  definitions: FieldOut[] | null,
  entryFields: Record<string, string>,
): FieldInput[] {
  if (definitions !== null) {
    return definitions.map((definition) => ({
      name: definition.name,
      kind: definition.kind,
      options: definition.options,
      value: valueFor(entryFields, definition.name),
    }));
  }
  return Object.keys(entryFields)
    .sort()
    .map((name) => ({
      name,
      // Nothing is known about the kind, so the least presumptuous one.
      kind: 'text' as const,
      options: [],
      value: entryFields[name]!,
    }));
}

/**
 * `fields` is patched, not replaced: names sent are set, names omitted
 * keep what they had. So every rendered field is sent, and an emptied
 * one is sent as "" — that is the documented way to clear a value.
 */
export function fieldsForRequest(inputs: FieldInput[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const input of inputs) {
    const value = input.value.trim();
    // A choice value the field no longer offers cannot be saved — the
    // server refuses it — and sending it as "" would silently destroy it.
    // `fields` is patched, so omitting the name leaves the stored value
    // exactly as it was. An empty value is NOT skipped: that is a clear,
    // and clearing must keep working.
    if (input.kind === 'choice' && value !== '' && !input.options.includes(value)) {
      continue;
    }
    fields[input.name] = value;
  }
  return fields;
}
