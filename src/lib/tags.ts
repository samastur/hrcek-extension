/** Trimmed, and nothing else — the capitals somebody typed are theirs. */
export function normalizeTag(raw: string): string {
  return raw.trim();
}

/**
 * Labels cannot differ from one another only by case — the server's
 * unique constraint sees to that — so comparing any other way would let
 * a duplicate through.
 */
export function sameTag(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function addTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (tag.length === 0) return tags;
  if (tags.some((existing) => sameTag(existing, tag))) return tags;
  return [...tags, tag];
}

export function removeTag(tags: string[], raw: string): string[] {
  return tags.filter((existing) => !sameTag(existing, raw));
}

/** What the autocomplete may offer: everything not already carried. */
export function suggestionsFor(labels: string[], tags: string[]): string[] {
  return labels.filter((label) => !tags.some((tag) => sameTag(tag, label)));
}
