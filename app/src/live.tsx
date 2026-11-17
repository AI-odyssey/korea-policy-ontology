// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Latest public records: real items from data/live-snapshot.json (built by `npm run ingest:snapshot`). They are public
// Signal records kept apart from the fictional store, so the assistant, briefs and reports never read them. Each item
// shows its source and opens the official page; the list is filtered by the selected client's monitoring profile.
import { useState } from 'react';
import { Button } from '@blueprintjs/core';
import type { ObjectRecord } from '../../ontology/index.ts';
import { Empty, Section, md } from './ui.tsx';
import type { App } from './ui.tsx';

export interface LiveSnapshot {
  from: string;
  to: string;
  generatedAt: string;
  sources: { id: string; name: string; signalType: string; ok: boolean; fetched: number; error?: string }[];
  matches: Record<string, string[]>;
  signals: ObjectRecord[];
}

// A glob, so the demo still builds when no snapshot has been made.
const files = import.meta.glob<LiveSnapshot>('../../data/live-snapshot.json', { eager: true, import: 'default' });
export const LIVE: LiveSnapshot | undefined = Object.values(files)[0];

export const liveFor = (clientId: string): ObjectRecord[] =>
  (LIVE?.signals ?? []).filter((s) => LIVE!.matches[s.id]?.includes(clientId))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));

/** Per source type: reached when every collector feeding it fetched without an error in the last live run. */
export function liveReach(): Record<string, boolean> | undefined {
  if (!LIVE) return undefined;
  const reach: Record<string, boolean> = {};
  for (const s of LIVE.sources) reach[s.signalType] = (reach[s.signalType] ?? true) && s.ok;
  return reach;
}

const KINDS: [string, string, string[]][] = [
  ['all', 'All', []], ['bills', 'Bills', ['bill_update']], ['meetings', 'Committee meetings', ['minutes']],
  ['notices', 'Notices', ['public_notice']], ['gazette', 'Gazette', ['gazette']], ['press', 'Press releases', ['press_release', 'ministry_press']],
  ['seminars', 'Seminars', ['seminar']], ['news', 'News', ['news']],
];

/** Newest first, but one of each kind of source before a second of any: a short list shows the range. */
export function mixed(items: ObjectRecord[]): ObjectRecord[] {
  const kind = (s: ObjectRecord) => KINDS.find(([, , t]) => t.includes(s.sourceType))?.[0];
  const seen = new Map<string | undefined, number>();
  const rank = new Map(items.map((s) => { const n = seen.get(kind(s)) ?? 0; seen.set(kind(s), n + 1); return [s.id, n]; }));
  return [...items].sort((a, b) => rank.get(a.id)! - rank.get(b.id)! || b.publishedAt.localeCompare(a.publishedAt));
}

const excerptOf = (s: ObjectRecord) => String(s.rawText).split('\n').slice(1).join(' ').trim();

function RecordItem({ s }: { s: ObjectRecord }) {
  const excerpt = excerptOf(s);
  return (
    <div className="item rec">
      <div className="item-title"><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></div>
      <div className="rec-meta"><span className="chip chip-record">Public record · {s.sourceName}</span><span className="sub">{md(s.publishedAt)}{s.publisher ? ` · ${s.publisher}` : ''}</span></div>
      {excerpt && <p className="sub rec-excerpt">{excerpt}</p>}
    </div>
  );
}

/** The client's latest public records; with `filters`, a row of source buttons above the list. */
export function PublicRecords({ app, limit, filters }: { app: App; limit: number; filters?: boolean }) {
  const [kind, setKind] = useState('all');
  const [all, setAll] = useState(false);
  if (!LIVE) return null;
  const mine = liveFor(app.clientId);
  const kinds = KINDS.filter(([id, , types]) => id === 'all' || mine.some((s) => types.includes(s.sourceType)));
  const types = KINDS.find(([id]) => id === kind)?.[2] ?? [];
  const shown = kind !== 'all' ? mine.filter((s) => types.includes(s.sourceType)) : filters ? mine : mixed(mine);
  return (
    <Section title="Latest public records" className="records">
      {filters && kinds.length > 2 && (
        <nav className="seg" aria-label="Source">
          {kinds.map(([id, label]) => <button key={id} className={kind === id ? 'on' : ''} aria-pressed={kind === id} onClick={() => (setKind(id), setAll(false))}>{label}</button>)}
        </nav>
      )}
      {!shown.length && <Empty>Nothing from {md(LIVE.from)} to {md(LIVE.to)}.</Empty>}
      {(all ? shown : shown.slice(0, limit)).map((s) => <RecordItem key={s.id} s={s} />)}
      {shown.length > limit && <Button size="small" variant="minimal" text={all ? 'Show fewer' : `Show all ${shown.length}`} onClick={() => setAll(!all)} />}
    </Section>
  );
}
