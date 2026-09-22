/** One image the page offered, before any ranking. */
export interface RawCandidate {
  url: string;
  /** 0 when unknown — head declarations carry no size. */
  width: number;
  height: number;
  fromHead: boolean;
}

export type Candidate = RawCandidate;

/** Below this in either direction it is furniture, not a picture. */
export const MIN_DIMENSION = 100;

/** Enough to choose from; small enough to pass in one message. */
export const MAX_CANDIDATES = 60;

function isFetchable(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // SVG is refused by the server outright — it is a document that can
    // carry script — so offering one would only waste a choice.
    return !/\.svgz?($|[?#])/i.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

/**
 * Head declarations first, in the order the page made them, then the
 * document's images largest first. A page that names its own picture has
 * answered the question; size is only the tie-breaker for the rest.
 */
export function rankCandidates(raw: RawCandidate[]): Candidate[] {
  const seen = new Set<string>();
  const head: Candidate[] = [];
  const body: Candidate[] = [];

  for (const candidate of raw) {
    if (!isFetchable(candidate.url)) continue;
    if (seen.has(candidate.url)) continue;
    // A head candidate's size is unknown, not small, so the floor does
    // not apply to it.
    if (
      !candidate.fromHead &&
      (candidate.width < MIN_DIMENSION || candidate.height < MIN_DIMENSION)
    ) {
      continue;
    }
    seen.add(candidate.url);
    (candidate.fromHead ? head : body).push(candidate);
  }

  body.sort((a, b) => b.width * b.height - a.width * a.height);
  return [...head, ...body].slice(0, MAX_CANDIDATES);
}
