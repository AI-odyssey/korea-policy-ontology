// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Small text helpers for list pages and feeds: entities, tags, dates, excerpts.

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };

export const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : NAMED[e.toLowerCase()] ?? m);

/** Tags out, entities decoded, whitespace collapsed. Entity-escaped markup (as in some API fields) is decoded first. */
export const plain = (html: string): string =>
  decodeEntities(decodeEntities(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

export const clip = (s: string, max = 300): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** '2026. 11. 7.' or '2026.11.07' or '2026-11-07' → '2026-11-07'; undefined when no date is present. */
export function isoDate(s: string): string | undefined {
  const m = /(20\d\d)\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : undefined;
}

export const inWindow = (date: string | undefined, from: string, to: string): date is string => !!date && date >= from && date <= to;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar date in Korea for an RFC 822 / ISO timestamp. */
export const kstDate = (stamp: string): string => new Date(new Date(stamp).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
