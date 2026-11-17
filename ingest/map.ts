// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// RawItem → ontology Signal (status new) plus one Evidence record (method rule) pointing at the source URL.
// Both are public records: provenance public, synthetic false, the official https URL. Triage decides links and
// relevance later; nothing here judges people or creates assessments, and no other object type is produced.
import type { ObjectRecord } from '../ontology/runtime.ts';
import type { SOURCE_TYPES } from '../ontology/schema.ts';
import type { RawItem, SourceType } from './core/types.ts';

export const SIGNAL_SOURCE_TYPE: Record<SourceType, (typeof SOURCE_TYPES)[number]> = {
  bill: 'bill_update',
  gov_bill: 'bill_update',
  legislative_notice: 'public_notice',
  admin_notice: 'public_notice',
  gazette: 'gazette',
  seminar: 'seminar',
  minutes: 'minutes',
  committee_press: 'press_release',
  ministry_press: 'ministry_press',
  news: 'news',
};

/** The source as readers see it, by connector id. */
export const SOURCE_NAME: Record<string, string> = {
  'assembly-bills': 'Assembly bill tracker',
  'assembly-bill-stages': 'Assembly bill tracker',
  'lawmaking-legislative-notices': 'Legislative notice',
  'lawmaking-admin-notices': 'Administrative notice',
  gwanbo: 'Official Gazette',
  'assembly-minutes': 'Committee minutes',
  'committee-sites': 'Committee website',
  'assembly-seminars': 'Assembly seminars',
  'assembly-committee-press': 'Committee press release',
  'korea-kr-press': 'Ministry press release',
  'google-news': 'News',
};

/** FNV-1a, so ids are stable across runs for the same source item. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const signalId = (item: Pick<RawItem, 'id'>) => `sig-live-${hash(item.id)}`;

export function toOntology(items: (RawItem & { outlets?: string[] })[]): ObjectRecord[] {
  const out: ObjectRecord[] = [];
  for (const item of items) {
    const sourceType = SIGNAL_SOURCE_TYPE[item.sourceType];
    const id = signalId(item);
    const base = { markings: ['PUBLIC'] as ObjectRecord['markings'], synthetic: false, provenance: 'public' as const };
    // News keeps only title, link, outlet and date: never article text.
    const excerpt = item.sourceType === 'news' ? undefined : item.excerpt;
    out.push({
      id, type: 'Signal', ...base,
      sourceType, title: item.title, url: item.url, collectedAt: item.fetchedAt,
      sourceName: SOURCE_NAME[item.sourceId] ?? item.sourceId, publishedAt: item.publishedAt,
      ...(item.institution ? { publisher: item.institution } : {}),
      rawText: excerpt ? `${item.title}\n${excerpt}` : item.title, status: 'new',
    });
    out.push({
      id: `ev-live-${hash(item.id)}`, type: 'Evidence', ...base,
      sourceUrl: item.url, sourceType, signalId: id, excerpt: (excerpt ?? item.title).slice(0, 300),
      method: 'rule', confidence: 1, reviewStatus: 'accepted',
    });
  }
  return out;
}
