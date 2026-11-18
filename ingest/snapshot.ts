// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// npm run ingest:snapshot [-- --from YYYY-MM-DD --to YYYY-MM-DD]   (default: the 14 days ending today in Korea)
// Fetches every source once for all profiles in ingest/profiles/, keeps each client's items and writes
// data/live-snapshot.json: public Signal records (titles, links, dates, institutions, short official excerpts;
// for news only title, link, outlet and date), which clients each one matched, and every source's fetch result.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CONNECTORS } from './connectors/index.ts';
import { runIngestMany } from './core/runner.ts';
import { termPattern } from './core/match.ts';
import { addDays, kstDate } from './core/text.ts';
import { SIGNAL_SOURCE_TYPE, SOURCE_NAME, signalId, toOntology } from './map.ts';
import type { MonitoringProfile, ScoredItem, SourceType } from './core/types.ts';
import type { ObjectRecord } from '../ontology/runtime.ts';

export const MAX_ITEMS = 200;
export const PER_CLIENT = 70;

/** Signal source type each connector produces, so a trial can tell which kinds of source were reached. */
export const CONNECTOR_TYPES: Record<string, SourceType[]> = {
  'assembly-bills': ['bill'], 'assembly-bill-stages': ['bill'], 'lawmaking-legislative-notices': ['legislative_notice'],
  'lawmaking-admin-notices': ['admin_notice'], gwanbo: ['gazette'], 'assembly-minutes': ['minutes'], 'committee-sites': ['minutes'],
  'assembly-seminars': ['seminar'], 'assembly-committee-press': ['committee_press'], 'korea-kr-press': ['ministry_press'], 'google-news': ['news'],
};

export interface LiveSnapshot {
  from: string;
  to: string;
  generatedAt: string;
  sources: { id: string; name: string; signalType: string; ok: boolean; fetched: number; kept: Record<string, number>; error?: string }[];
  matches: Record<string, string[]>; // Signal id -> client ids whose profile it matched
  why: Record<string, Record<string, Why>>; // Signal id -> client id -> what made it match
  signals: ObjectRecord[];
}

/** Why an item was kept for a client: the keywords that hit and the one agenda or text line where the first hit appears
 * (a meeting agenda or a grouped bill notice is long, so readers see the matching line, not the whole list), or the
 * watched committee when the item was kept for its committee alone. */
export interface Why { terms: string[]; line?: string; committee?: string }

const MAX_LINE = 140;
export function why(item: ScoredItem, synonymsOf: (term: string) => string[]): Why {
  if (!item.matched.length) return { terms: [], ...(item.committee ? { committee: item.committee } : {}) };
  const pats = item.matched.flatMap((t) => [t, ...synonymsOf(t)]).map((t) => termPattern(t));
  const lines = `${item.excerpt ?? ''}\n${item.matchText ?? ''}`.split(/\n| · |; |, (?=\S+법)/).map((x) => x.trim()).filter(Boolean);
  const hit = lines.find((x) => pats.some((re) => re.test(x.toLowerCase())));
  const line = hit && hit !== item.title ? (hit.length > MAX_LINE ? `${hit.slice(0, MAX_LINE - 1)}…` : hit) : undefined;
  return { terms: item.matched, ...(line ? { line } : {}) };
}

/** Picks each client's latest items (at most PER_CLIENT), then the union capped at MAX_ITEMS, newest first. */
export function buildSnapshot(window: { from: string; to: string }, generatedAt: string, fetched: { sourceId: string; ok: boolean; count: number; error?: string }[], byClient: Map<string, ScoredItem[]>, kept: Map<string, Record<string, number>>, profiles: MonitoringProfile[] = []): LiveSnapshot {
  const synonyms = (clientId: string) => (term: string) => profiles.find((p) => p.clientId === clientId)?.keywords.find((k) => k.term === term)?.synonyms ?? [];
  const reasons: Record<string, Record<string, Why>> = {};
  const newest = (a: ScoredItem, b: ScoredItem) => b.publishedAt.localeCompare(a.publishedAt) || b.score - a.score || a.id.localeCompare(b.id);
  const chosen = new Map<string, ScoredItem>();
  const matches: Record<string, string[]> = {};
  for (const [clientId, items] of byClient) {
    for (const item of [...items].sort(newest).slice(0, PER_CLIENT)) {
      chosen.set(item.id, chosen.get(item.id) ?? item);
      (matches[signalId(item)] ??= []).push(clientId);
      (reasons[signalId(item)] ??= {})[clientId] = why(item, synonyms(clientId));
    }
  }
  const items = [...chosen.values()].sort(newest).slice(0, MAX_ITEMS);
  const ids = new Set(items.map(signalId));
  return {
    ...window,
    generatedAt,
    sources: fetched.map((s) => ({
      id: s.sourceId, name: SOURCE_NAME[s.sourceId] ?? s.sourceId, signalType: SIGNAL_SOURCE_TYPE[CONNECTOR_TYPES[s.sourceId]?.[0] ?? 'news'],
      ok: s.ok, fetched: s.count, kept: Object.fromEntries([...kept].map(([c, k]) => [c, k[s.sourceId] ?? 0])), ...(s.error ? { error: s.error } : {}),
    })),
    matches: Object.fromEntries(Object.entries(matches).filter(([id]) => ids.has(id))),
    why: Object.fromEntries(Object.entries(reasons).filter(([id]) => ids.has(id))),
    signals: toOntology(items).filter((o) => o.type === 'Signal'),
  };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' }, out: { type: 'string' } } });
  const to = values.to ?? kstDate(new Date().toISOString());
  const from = values.from ?? addDays(to, -13);
  const dir = new URL('./profiles/', import.meta.url);
  const profiles: MonitoringProfile[] = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
  const { fetched, byProfile } = await runIngestMany({ from, to }, profiles, CONNECTORS);
  const kept = new Map([...byProfile].map(([c, r]) => [c, Object.fromEntries(r.perSource.map((s) => [s.sourceId, s.kept]))]));
  const snap = buildSnapshot({ from, to }, new Date().toISOString(), fetched, new Map([...byProfile].map(([c, r]) => [c, r.items])), kept, profiles);
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  console.log(`${from} ~ ${to}\n\n${pad('source', 32)}${pad('ok', 5)}${pad('fetched', 9)}${profiles.map((p) => pad(`kept ${p.clientId}`, 16)).join('')}error`);
  for (const s of snap.sources) console.log(`${pad(s.id, 32)}${pad(s.ok ? 'yes' : 'NO', 5)}${pad(s.fetched, 9)}${profiles.map((p) => pad(s.kept[p.clientId], 16)).join('')}${s.error ?? ''}`);
  for (const p of profiles) console.log(`${p.clientId}: ${byProfile.get(p.clientId)!.items.length} items after merging duplicates`);
  const out = values.out ?? new URL('../data/live-snapshot.json', import.meta.url);
  writeFileSync(out, `${JSON.stringify(snap, null, 1)}\n`);
  console.log(`\n${snap.signals.length} signals -> ${out instanceof URL ? 'data/live-snapshot.json' : out}`);
}
