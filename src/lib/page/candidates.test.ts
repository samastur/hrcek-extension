import { describe, expect, it } from 'vitest';
import { MAX_CANDIDATES, rankCandidates } from './candidates';

function img(url: string, width = 600, height = 400) {
  return { url, width, height, fromHead: false };
}
function head(url: string) {
  return { url, width: 0, height: 0, fromHead: true };
}

describe('rankCandidates', () => {
  it('puts what the head declared first, whatever its size', () => {
    // A page that says which picture represents it has answered the
    // question; a bigger photo further down has not.
    expect(
      rankCandidates([
        img('https://e.test/big.jpg', 2000, 2000),
        head('https://e.test/og.jpg'),
      ]).map((c) => c.url),
    ).toEqual(['https://e.test/og.jpg', 'https://e.test/big.jpg']);
  });

  it('keeps head candidates in the order they were declared', () => {
    expect(
      rankCandidates([head('https://e.test/og.jpg'), head('https://e.test/tw.jpg')]).map(
        (c) => c.url,
      ),
    ).toEqual(['https://e.test/og.jpg', 'https://e.test/tw.jpg']);
  });

  it('sorts the document images biggest first', () => {
    expect(
      rankCandidates([
        img('https://e.test/s.jpg', 200, 200),
        img('https://e.test/l.jpg', 800, 800),
      ]).map((c) => c.url),
    ).toEqual(['https://e.test/l.jpg', 'https://e.test/s.jpg']);
  });

  it('drops images too small to be worth saving', () => {
    expect(rankCandidates([img('https://e.test/icon.png', 32, 32)])).toEqual([]);
  });

  it('never drops a head candidate for being small — its size is unknown', () => {
    expect(rankCandidates([head('https://e.test/og.jpg')])).toHaveLength(1);
  });

  it('drops SVG, which the server refuses outright', () => {
    // It is a document that can carry script.
    expect(
      rankCandidates([img('https://e.test/logo.svg'), head('https://e.test/h.svg')]),
    ).toEqual([]);
  });

  it('de-duplicates, keeping the earlier — and so the head — entry', () => {
    const ranked = rankCandidates([
      head('https://e.test/a.jpg'),
      img('https://e.test/a.jpg', 900, 900),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.fromHead).toBe(true);
  });

  it('drops anything that is not an http address', () => {
    expect(
      rankCandidates([img('data:image/png;base64,iVBORw0KGgo='), img('about:blank')]),
    ).toEqual([]);
  });

  it('caps the list, so the message back from the page stays small', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      img(`https://e.test/${i}.jpg`, 500 + i, 500),
    );
    expect(rankCandidates(many)).toHaveLength(MAX_CANDIDATES);
  });

  it('sorts by area, not by either dimension alone', () => {
    // wide.jpg is far wider (1000 vs 200) but tall.jpg has the bigger
    // area (140,000 vs 120,000) thanks to its height (700 vs 120) — a
    // width-only sort would put wide.jpg first, which is wrong here.
    expect(
      rankCandidates([
        img('https://e.test/wide.jpg', 1000, 120),
        img('https://e.test/tall.jpg', 200, 700),
      ]).map((c) => c.url),
    ).toEqual(['https://e.test/tall.jpg', 'https://e.test/wide.jpg']);
  });

  it('drops an SVG even behind a query string, and keeps a host that merely contains .svg', () => {
    expect(
      rankCandidates([
        img('https://e.test/logo.svg?v=2'),
        img('https://svg.e.test/photo.jpg', 800, 600),
      ]).map((c) => c.url),
    ).toEqual(['https://svg.e.test/photo.jpg']);
  });

  it('drops a string that is not a URL at all', () => {
    // Candidates come from whatever the page contained; a malformed one
    // must be dropped, not thrown out of the ranking.
    expect(rankCandidates([img('not a url at all')])).toEqual([]);
  });
});
