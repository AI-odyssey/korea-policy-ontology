// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Cross-source merging. News stories are merged across outlets (see mergeStories). Everything else is merged only
// on an identical URL, because different bills often share a title (e.g. many "도로교통법 일부개정법률안").
import type { RawItem } from './types.ts';

export const stripOutlet = (title: string): string => title.replace(/\s+-\s+[^-]+$/, '').trim();

export function normTitle(title: string): string {
  return stripOutlet(title)
    .replace(/\[[^\]]*\]|\([^)]*\)|[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ratcliff/Obershelp similarity, the measure behind Python's difflib.SequenceMatcher.ratio(). */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const matches = (a: string, b: string): number => {
    let best = 0, ai = 0, bi = 0;
    const prev = new Array<number>(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      let diag = 0;
      for (let j = 1; j <= b.length; j++) {
        const keep = prev[j];
        prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
        if (prev[j] > best) [best, ai, bi] = [prev[j], i - prev[j], j - prev[j]];
        diag = keep;
      }
    }
    if (!best) return 0;
    return best + matches(a.slice(0, ai), b.slice(0, bi)) + matches(a.slice(ai + best), b.slice(bi + best));
  };
  return (2 * matches(a, b)) / (a.length + b.length);
}

/** Same story: close character similarity, or most of the shorter title's words shared. */
export function sameStory(a: string, b: string): boolean {
  const na = normTitle(a), nb = normTitle(b);
  if (similarity(na, nb) >= 0.55) return true;
  const words = (s: string) => new Set(s.split(' ').filter((w) => w.length > 1));
  const wa = words(na), wb = words(nb);
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.max(1, Math.min(wa.size, wb.size)) >= 0.6;
}

// Korean particles at the end of a word ("토스뱅크가", "솔라나와") would hide a shared name.
const PARTICLE = /(으로|에서|은|는|이|가|을|를|의|에|로|와|과|도|만)$/u;
export const titleWords = (title: string): Set<string> =>
  new Set(normTitle(title).split(' ').map((w) => (w.length > 2 ? w.replace(PARTICLE, '') : w)).filter((w) => w.length > 1));

const dayGap = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * News: the same story from several outlets becomes one item (the earliest copy) listing the outlets. Two titles are
 * the same story when they read alike (sameStory) or, within two days, share two or more words other than the ones
 * in most of the batch's titles (the search term itself): a company name and a detail ("토스뱅크", "솔라나").
 */
export function mergeStories<T extends RawItem>(items: T[]): (T & { outlets?: string[] })[] {
  const byUrl = new Map<string, T>();
  for (const i of [...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))) if (!byUrl.has(i.url)) byUrl.set(i.url, i);
  const news = [...byUrl.values()].filter((i) => i.sourceType === 'news');
  const words = new Map(news.map((i) => [i.url, titleWords(i.title)]));
  const df = new Map<string, number>();
  for (const ws of words.values()) for (const w of ws) df.set(w, (df.get(w) ?? 0) + 1);
  const rareMax = Math.max(3, 0.5 * news.length); // only words in most titles (the query term itself) are too common to count
  const shareRare = (a: T, b: T) => [...words.get(a.url)!].filter((w) => words.get(b.url)!.has(w) && df.get(w)! <= rareMax).length >= 2;
  const same = (a: T, b: T) => sameStory(a.title, b.title) || (dayGap(a.publishedAt, b.publishedAt) <= 2 && shareRare(a, b));

  // A copy joins a story when it matches any copy already in it, so differently worded copies still meet.
  const out: (T & { outlets?: string[] })[] = [];
  const copies = new Map<string, T[]>();
  for (const i of byUrl.values()) {
    const story = i.sourceType === 'news' ? out.find((o) => o.sourceType === 'news' && copies.get(o.url)!.some((c) => same(c, i))) : undefined;
    if (!story) {
      out.push(i.sourceType === 'news' ? { ...i, outlets: i.institution ? [i.institution] : [] } : { ...i });
      copies.set(i.url, [i]);
    } else {
      copies.get(story.url)!.push(i);
      if (i.institution && !story.outlets!.includes(i.institution)) story.outlets!.push(i.institution);
    }
  }
  return out;
}
