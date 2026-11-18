// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Keyword matching against a client's profile. A space in a keyword matches any spacing ("로봇 보험" matches
// "로봇보험"), and a keyword written solid matches the text split into words of two or more characters
// ("배달로봇" matches "배달 로봇"). A split that leaves a single character is not allowed, so "대체육" does not
// match "순천대 체육관". A keyword with an exclude term present does not count for that item.
import type { Keyword, MonitoringProfile, RawItem } from './types.ts';

export const PRIORITY_WEIGHT: Record<Keyword['priority'], number> = { high: 3, medium: 2, low: 1 };
/** A lone low-priority keyword (a statute's name, say) is not enough: it needs a medium or high hit, or two low ones. */
export const MIN_SCORE = 2;
const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function termPattern(term: string): RegExp {
  const words = term.toLowerCase().trim().split(/\s+/).map((w) => {
    const cs = [...w];
    return cs.map((c, i) => (i >= 2 && cs.length - i >= 2 ? '\\s?' : '') + esc(c)).join('');
  });
  const body = words.join('\\s*');
  return new RegExp(/^[\x20-\x7e]+$/.test(term) ? `(?<![a-z0-9])${body}(?![a-z0-9])` : body, 'u'); // Latin terms match whole words
}

const patterns = new Map<string, RegExp>();
export const has = (text: string, term: string) => (patterns.get(term) ?? patterns.set(term, termPattern(term)).get(term)!).test(text);

export function matchItem(item: Pick<RawItem, 'title' | 'excerpt' | 'matchText'>, profile: Pick<MonitoringProfile, 'keywords'>): { score: number; matched: string[] } {
  const text = `${item.title} ${item.excerpt ?? ''} ${item.matchText ?? ''}`.toLowerCase().replace(/\s+/g, ' ');
  const matched: string[] = [];
  let score = 0;
  for (const k of profile.keywords) {
    if (k.exclude?.some((x) => has(text, x))) continue;
    if ([k.term, ...(k.synonyms ?? [])].some((t) => has(text, t))) {
      matched.push(k.term);
      score += PRIORITY_WEIGHT[k.priority];
    }
  }
  return { score, matched };
}
