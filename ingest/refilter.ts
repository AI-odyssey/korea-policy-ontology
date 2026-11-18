// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// npm run ingest:refilter   Applies the current profiles to data/live-snapshot.json without a network call.
// The snapshot keeps each item's title, short excerpt, outlet and the keywords that matched (and the matching line), not the
// long agenda text, so the rule is applied to those: a keyword whose exclude phrase appears is dropped, an item must still
// reach MIN_SCORE, an item kept for its committee alone is dropped, and excluded outlets are dropped.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { has, MIN_SCORE, PRIORITY_WEIGHT } from './core/match.ts';
import type { MonitoringProfile } from './core/types.ts';
import type { LiveSnapshot } from './snapshot.ts';

/** The connector an item most likely came from, to adjust the per-source counts. */
const connectorOf = (s: { sourceType: string; title: string }): string =>
  s.sourceType === 'news' ? 'google-news' : s.sourceType === 'press_release' ? 'assembly-committee-press' : s.sourceType === 'minutes' ? 'committee-sites'
    : s.sourceType === 'seminar' ? 'assembly-seminars' : s.title.startsWith('[소관위 상정]') ? 'assembly-bill-stages' : 'assembly-bills';

export function refilterSnapshot(snap: LiveSnapshot, profiles: MonitoringProfile[]): { snapshot: LiveSnapshot; dropped: { id: string; clientId: string; title: string }[] } {
  const dropped: { id: string; clientId: string; title: string }[] = [];
  const matches: LiveSnapshot['matches'] = {};
  const why: LiveSnapshot['why'] = {};
  for (const sig of snap.signals) {
    for (const clientId of snap.matches[sig.id] ?? []) {
      const profile = profiles.find((p) => p.clientId === clientId);
      const w = snap.why[sig.id]?.[clientId];
      if (!profile || !w) continue;
      const text = `${sig.title} ${sig.rawText ?? ''} ${w.line ?? ''}`.toLowerCase().replace(/\s+/g, ' ');
      const terms = w.terms.filter((t) => {
        const k = profile.keywords.find((x) => x.term === t);
        return !k?.exclude?.some((x) => has(text, x));
      });
      const score = terms.reduce((n, t) => n + PRIORITY_WEIGHT[profile.keywords.find((x) => x.term === t)?.priority ?? 'low'], 0);
      const outlet = sig.publisher && profile.excludeOutlets?.includes(sig.publisher);
      if (outlet || score < MIN_SCORE) { dropped.push({ id: sig.id, clientId, title: sig.title }); continue; }
      (matches[sig.id] ??= []).push(clientId);
      (why[sig.id] ??= {})[clientId] = { ...w, terms };
    }
  }
  const signals = snap.signals.filter((s) => matches[s.id]);
  const byId = new Map(snap.signals.map((s) => [s.id, s]));
  const sources = snap.sources.map((src) => ({ ...src, kept: { ...src.kept } }));
  for (const d of dropped) {
    const src = sources.find((x) => x.id === connectorOf(byId.get(d.id) as never));
    if (src && src.kept[d.clientId] > 0) src.kept[d.clientId]--;
  }
  return { snapshot: { ...snap, sources, matches, why, signals }, dropped };
}

if (import.meta.main) {
  const path = new URL('../data/live-snapshot.json', import.meta.url);
  const dir = new URL('./profiles/', import.meta.url);
  const profiles: MonitoringProfile[] = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
  const before = JSON.parse(readFileSync(path, 'utf8')) as LiveSnapshot;
  const { snapshot, dropped } = refilterSnapshot(before, profiles);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 1)}\n`);
  const count = (s: LiveSnapshot, c: string) => Object.values(s.matches).filter((m) => m.includes(c)).length;
  for (const p of profiles) console.log(`${p.clientId}: ${count(before, p.clientId)} -> ${count(snapshot, p.clientId)}`);
  for (const d of dropped) console.log(`dropped for ${d.clientId}: ${d.title}`);
}
