// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// The weekly brief: what the client's executives read. The This week screen and the weekly report both render it,
// so the page and the report say the same things in the same order.
import type { ObjectRecord, View } from '../ontology/runtime.ts';
import { addDays, monthDay } from '../ontology/dates.ts';
import { cmp, confirmedView, responseFacts, responseLevel, upcomingDeadlines } from '../ontology/functions.ts';
import type { ResponseFacts, ResponseLevel } from '../ontology/functions.ts';
import { proposeTriage } from './triage.ts';

export const LEVEL_RANK: Record<ResponseLevel, number> = { act_now: 0, engage: 1, monitor: 2, watch: 3 };
const CLOSED = ['passed', 'merged_alternative', 'withdrawn'];
const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
/** 'One', 'Two' ... 'Ten', then digits. */
export const countWord = (n: number) => COUNT[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const billName = (b?: ObjectRecord) => (b ? String(b.shortTitle ?? b.billNo ?? b.title) : '');
/** The meeting's forum in words. The Legislation and Judiciary Committee meets as a full committee but readers know it by name. */
export function forumOf(view: View, e: ObjectRecord): string {
  if (e.institutionId === 'inst-ljc') return 'Legislation and Judiciary Committee';
  if (e.kind === 'subcommittee') return String(view.get(e.institutionId)?.name ?? '').startsWith('Bill Review') ? 'bill review subcommittee' : 'subcommittee';
  return ({ full_committee: 'full committee', plenary: 'plenary session' } as Record<string, string>)[e.kind] ?? 'committee';
}

const PAST: Record<string, string> = {
  public_comment: 'went out for legislative notice', submitted: 'was submitted', committee_referred: 'was referred to committee',
  committee_review: 'was placed on the committee agenda', subcommittee: 'went to subcommittee review', subcommittee_passed: 'passed the bill review subcommittee',
  committee_passed: 'passed the full committee', lj_review: 'went to Legislation and Judiciary review', plenary_pending: 'cleared Legislation and Judiciary review', passed: 'passed the plenary',
};
const NOW: Record<string, string> = {
  committee_review: 'on the committee agenda', subcommittee: 'in subcommittee review', committee_referred: 'with the committee',
  public_comment: 'out for legislative notice', lj_review: 'in Legislation and Judiciary review', submitted: 'awaiting referral',
};
const WANTS: Record<string, string> = { amend: 'wants it amended', oppose: 'opposes it', support: 'supports it', monitor: 'is watching it' };

export interface RankedBill { bill: ObjectRecord; level: ResponseLevel; facts: ResponseFacts }

/** Open bills the engagement follows, most pressing first: response level, then the nearest meeting. */
export function rankedBills(view: View, clientId: string, since: string): RankedBill[] {
  const eng = view.list('Engagement', (e) => e.clientId === clientId)[0];
  if (!eng) return [];
  return view.targets(eng.id, 'watches').filter((o) => o.type === 'Bill' && !CLOSED.includes(o.stage))
    .map((bill) => ({ bill, level: responseLevel(view, bill.id, clientId, since).level, facts: responseFacts(view, bill.id, clientId, since) }))
    .sort((x, y) => LEVEL_RANK[x.level] - LEVEL_RANK[y.level] || (x.facts.daysToSlot ?? 99) - (y.facts.daysToSlot ?? 99) || cmp(x.bill.id, y.bill.id));
}

/** The week in one line and a sentence, written from the most pressing followed bill. */
export function headline(view: View, clientId: string, top?: RankedBill): { headline: string; lead: string } {
  if (!top) return { headline: 'No followed bill moves this week', lead: '' };
  const { bill, facts: f } = top;
  const name = `The ${lower1(billName(bill))}`;
  const h = f.slot ? `${name} goes to the ${forumOf(view, f.slot)} on ${monthDay(f.slot.date)}` : `${name} is ${NOW[bill.stage] ?? 'pending'}`;
  const lead = f.change ? `It ${PAST[f.change.to] ?? 'moved'} on ${monthDay(f.change.date)}.` : f.position ? `${view.get(clientId)!.name} ${WANTS[f.position.stance]}.` : '';
  return { headline: h, lead };
}

export const decisionsLine = (n: number) => (n === 0 ? 'No decision is needed this week.' : `${countWord(n)} decision${n === 1 ? ' is' : 's are'} needed this week.`);

/** Risks or opportunities in the order of the bills they concern: response level, then impact, then urgency. */
export function orderedRiskOpportunities(view: View, clientId: string, since: string, kind: 'risk' | 'opportunity'): ObjectRecord[] {
  const ranked = rankedBills(view, clientId, since);
  const levelOf = (id: string): number => {
    const o = view.get(id);
    if (o?.type === 'Bill') return LEVEL_RANK[ranked.find((r) => r.bill.id === id)?.level ?? (CLOSED.includes(o.stage) ? 'watch' : responseLevel(view, id, clientId, since).level)];
    if (o?.type === 'Issue') return Math.min(3, ...ranked.filter((r) => view.targets(r.bill.id, 'about').some((i) => i.id === id)).map((r) => LEVEL_RANK[r.level]));
    return 3;
  };
  const rank = (r: ObjectRecord) => Math.min(...(r.subjectIds as string[]).map(levelOf));
  const urgency = ['imminent', 'in_progress', 'ongoing'];
  return view.list('RiskOpportunity', (r) => r.clientId === clientId && r.kind === kind)
    .sort((a, b) => rank(a) - rank(b) || (a.impact === 'high' ? 0 : 1) - (b.impact === 'high' ? 0 : 1) || urgency.indexOf(a.urgency) - urgency.indexOf(b.urgency) || cmp(a.id, b.id));
}

/** The document a fact comes from: the latest item naming the bill, or the notice for a meeting. */
export function sourceFor(view: View, id: string): string | undefined {
  const o = view.get(id);
  if (!o) return undefined;
  const sigs = view.list('Signal', (s) => s.status !== 'dismissed' && s.collectedAt.slice(0, 10) <= view.baseDate);
  const latest = (xs: ObjectRecord[]) => xs.sort((a, b) => cmp(b.collectedAt, a.collectedAt) || cmp(b.id, a.id))[0]?.id;
  if (o.type === 'Bill') return latest(sigs.filter((s) => ['bill_update', 'public_notice'].includes(s.sourceType) && (o.billNo ? s.rawText.includes(o.billNo) : s.rawText.includes(o.title))));
  if (o.type === 'Event') return latest(sigs.filter((s) => s.rawText.includes(o.name) && s.rawText.includes(monthDay(o.date))))
    ?? (o.kind === 'public_comment' ? view.targets(o.id, 'agenda_item').map((b) => sourceFor(view, b.id)).find(Boolean) : undefined);
  if (o.type === 'RiskOpportunity') return (o.subjectIds as string[]).map((s) => sourceFor(view, s)).find(Boolean);
  return undefined;
}

export interface TimelineItem { date: string; title: string; who: string; status: string; id: string }
export const OWNER: Record<string, string> = { human: 'Our team', agent: 'Assistant', client: 'Client' };

/** Dated items in the next 30 days. Client-facing output leaves out the team's own tasks; asks of the client are listed apart. */
export function timeline(view: View, clientId: string, opts: { clientFacing?: boolean } = {}): TimelineItem[] {
  const eng = view.list('Engagement', (e) => e.clientId === clientId)[0];
  const watched = new Set(eng ? view.targets(eng.id, 'watches').map((o) => o.id) : []);
  const items: TimelineItem[] = [];
  for (const d of upcomingDeadlines(view, clientId, 30)) {
    const o = view.get(d.objectId)!;
    if (d.kind === 'task') {
      if (o.owner === 'client' || opts.clientFacing) continue;
      items.push({ date: d.date, title: o.title, who: OWNER[o.owner], status: 'To do', id: o.id });
      continue;
    }
    const bill = d.billIds.find((b) => watched.has(b));
    if (!bill && o.kind !== 'hearing') continue;
    const inst = view.get(o.institutionId);
    const what = o.kind === 'public_comment' ? 'Notice period closes' : o.kind === 'hearing' ? o.name : cap(forumOf(view, o));
    items.push({ date: d.date, title: bill && o.kind !== 'hearing' ? `${what}: ${billName(view.get(bill))}` : what, who: inst && ['ministry', 'agency'].includes(inst.kind) ? 'Government' : 'National Assembly', status: 'Scheduled', id: o.id });
  }
  return items;
}

export interface Move { subject: ObjectRecord; stance: string; date: string; text: string; sourceId?: string; issueTitle?: string }
// The issue an item is about: its filed link, or the triage rule's guess while it waits.
const issueOf = (view: View, sig: ObjectRecord): string | undefined => {
  const id = view.targets(sig.id, 'about')[0]?.id ?? proposeTriage(view, sig).issueId;
  return id ? view.get(id)?.title : undefined;
};
const sentenceWith = (text: string, name: string) => text.split(/(?<=\.)\s+/).find((x) => x.includes(name));

/** Assessed people and organizations who did something this week: named in an item, spoke at a meeting, met the team. */
export function moves(view: View, clientId: string, since: string): Move[] {
  const inWeek = (d: string) => d.slice(0, 10) > since && d.slice(0, 10) <= view.baseDate;
  const week = view.list('Signal', (x) => x.status !== 'dismissed' && inWeek(x.collectedAt));
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const a of view.list('StakeholderAssessment', (x) => x.clientId === clientId).sort((x, y) => cmp(x.id, y.id))) {
    if (seen.has(a.subjectId)) continue;
    const s = view.get(a.subjectId)!;
    const acts = [
      // This week's items may not be filed yet, so a name in the text counts as well as a filed mention.
      ...week.flatMap((x) => { const t = sentenceWith(x.rawText, s.name); return t ? [{ date: x.collectedAt.slice(0, 10), text: t, sourceId: x.id, issueTitle: issueOf(view, x) }] : []; }),
      ...view.targets(s.id, 'testifies_at').filter((e) => e.status === 'held' && inWeek(e.date)).map((e) => ({ date: e.date, text: `Spoke at the ${e.name}.`, sourceId: sourceFor(view, e.id), issueTitle: view.targets(e.id, 'about')[0]?.title })),
      ...view.list('Interaction', (x) => x.clientId === clientId && inWeek(x.date) && x.participantIds.includes(s.id)).map((x) => ({ date: x.date, text: x.summary, sourceId: undefined, issueTitle: undefined })),
    ].sort((x, y) => cmp(y.date, x.date));
    if (!acts.length) continue;
    seen.add(s.id);
    out.push({ subject: s, stance: a.stance, ...acts[0] });
  }
  return out.sort((x, y) => cmp(y.date, x.date) || cmp(x.subject.id, y.subject.id));
}

export const asks = (view: View, clientId: string) =>
  view.list('Task', (t) => t.clientId === clientId && t.owner === 'client' && t.status === 'open').sort((a, b) => cmp(a.dueDate, b.dueDate) || cmp(a.id, b.id));

export interface Brief {
  since: string;
  headline: string;
  lead: string;
  bills: RankedBill[];
  decisions: ObjectRecord[];
  risks: ObjectRecord[];
  opportunities: ObjectRecord[];
  timeline: TimelineItem[];
  moves: Move[];
  asks: ObjectRecord[];
}

export function weeklyBrief(view: View, clientId: string, opts: { since?: string; clientFacing?: boolean } = {}): Brief {
  view = confirmedView(view);
  const since = opts.since ?? addDays(view.baseDate, -7);
  const bills = rankedBills(view, clientId, since);
  const h = headline(view, clientId, bills[0]);
  return {
    since, ...h, bills,
    decisions: view.list('Decision', (d) => d.clientId === clientId && d.status === 'open').sort((a, b) => cmp(String(a.dueDate ?? '9'), String(b.dueDate ?? '9')) || cmp(a.id, b.id)),
    risks: orderedRiskOpportunities(view, clientId, since, 'risk'),
    opportunities: orderedRiskOpportunities(view, clientId, since, 'opportunity'),
    timeline: timeline(view, clientId, opts),
    moves: moves(view, clientId, since),
    asks: asks(view, clientId),
  };
}
