// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Runs connectors for one profile and window. A failing source never stops the others; its error is
// reported per source. Kept: keyword matches, plus committee-scoped minutes, meetings and press releases for the
// profile's committees (meetings with a known agenda only when it hits a keyword; no budget sessions), plus
// stage changes of bills the profile watches.
import { mergeStories } from './dedup.ts';
import { matchItem } from './match.ts';
import type { Connector, MonitoringProfile, RawItem, ScoredItem, SourceType, Window } from './types.ts';

export interface SourceResult {
  sourceId: string;
  label: string;
  ok: boolean;
  count: number; // items the source returned for the window
  kept: number; // of those, items kept for this profile (before cross-source merging)
  error?: string;
}

export interface IngestResult {
  items: ScoredItem[];
  perSource: SourceResult[];
}

const COMMITTEE_SCOPED: ReadonlySet<SourceType> = new Set(['minutes', 'committee_press']);

export function keep(item: RawItem, profile: MonitoringProfile): ScoredItem | undefined {
  const { score, matched } = matchItem(item, profile);
  // A watched committee's meeting counts when its agenda hits a keyword (checked above, on the full agenda); one
  // with no agenda yet is kept unless it is a budget or settlement session. Press releases: the same budget rule.
  const budgetOnly = /예산|결산/.test(item.title) && !/법률안|법안/.test(item.title);
  const agendaKnown = item.sourceType === 'minutes' && !!item.matchText;
  const scoped = COMMITTEE_SCOPED.has(item.sourceType) && !!item.committee && profile.committees.some((c) => item.committee!.startsWith(c)) && !budgetOnly && !agendaKnown;
  const watched = !!profile.watchBills?.some((n) => n === item.billNo || !!item.excerpt?.includes(n)); // grouped stage items list their numbers
  return score > 0 || scoped || watched ? { ...item, score, matched } : undefined;
}

/** Fetches every source once for several profiles (with the union of their keywords and committees) and keeps
 * each profile's items separately. A failing source never stops the others; its error is reported per source. */
export async function runIngestMany(window: Window, profiles: MonitoringProfile[], connectors: Connector[]): Promise<{ fetched: SourceResult[]; byProfile: Map<string, IngestResult> }> {
  const fetchedAt = new Date().toISOString();
  const union: MonitoringProfile = {
    clientId: profiles.map((p) => p.clientId).join('+'),
    keywords: [...new Map(profiles.flatMap((p) => p.keywords).map((k) => [k.term, k])).values()],
    committees: [...new Set(profiles.flatMap((p) => p.committees))],
    agencies: [...new Set(profiles.flatMap((p) => p.agencies))],
    watchBills: [...new Set(profiles.flatMap((p) => p.watchBills ?? []))],
  };
  const wanted = (p: MonitoringProfile, c: Connector) => !p.sources || p.sources.includes(c.id);
  const chosen = connectors.filter((c) => profiles.some((p) => wanted(p, c)));
  const results = await Promise.all(
    chosen.map(async (c) => {
      try {
        return { c, items: await c.fetch({ ...window, profile: union, fetchedAt }) };
      } catch (e) {
        return { c, items: [] as RawItem[], error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  const fetched: SourceResult[] = results.map(({ c, items, error }) => ({ sourceId: c.id, label: c.label, ok: !error, count: items.length, kept: 0, ...(error ? { error } : {}) }));
  const byProfile = new Map<string, IngestResult>();
  for (const profile of profiles) {
    const perSource: SourceResult[] = [];
    const kept: ScoredItem[] = [];
    for (const [i, { c, items }] of results.entries()) {
      if (!wanted(profile, c)) continue;
      const mine = items.map((it) => keep(it, profile)).filter((it): it is ScoredItem => !!it);
      kept.push(...mine);
      perSource.push({ ...fetched[i], kept: mine.length });
    }
    byProfile.set(profile.clientId, { items: mergeStories(kept).sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt)), perSource });
  }
  return { fetched, byProfile };
}

export async function runIngest(window: Window, profile: MonitoringProfile, connectors: Connector[]): Promise<IngestResult> {
  return (await runIngestMany(window, [profile], connectors)).byProfile.get(profile.clientId)!;
}
