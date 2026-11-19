// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// The weekly brief: what the head of government affairs works from and what company leadership reads. The This week screen and the weekly report both render it,
// so the page and the report say the same things in the same order.
import type { ObjectRecord, View } from '../ontology/runtime.ts';
import { addDays, monthDay } from '../ontology/dates.ts';
import { cmp, confirmedSignals, confirmedView, daysToStep, responseFacts, responseLevel, stepKind, upcomingDeadlines } from '../ontology/functions.ts';
import type { ResponseFacts, ResponseLevel } from '../ontology/functions.ts';

export const LEVEL_RANK: Record<ResponseLevel, number> = { act_now: 0, engage: 1, monitor: 2, watch: 3 };
const CLOSED = ['passed', 'merged_alternative', 'withdrawn'];
const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
/** 'One', 'Two' ... 'Ten', then digits. */
export const countWord = (n: number) => COUNT[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const billName = (b?: ObjectRecord) => (b ? String(b.shortTitle ?? b.billNo ?? b.title) : '');
/** A subcommittee by its own name, in lower case: "bill review subcommittee", "economy and finance subcommittee". One body keeps one name on every screen. */
export const subcommitteeName = (view: View, institutionId?: string): string => String(view.get(institutionId ?? '')?.name ?? 'subcommittee').split(',')[0].toLowerCase();
/** The meeting's forum in words. The Legislation and Judiciary Committee meets as a full committee but readers know it by name. */
export function forumOf(view: View, e: ObjectRecord): string {
  if (e.institutionId === 'inst-ljc') return 'Legislation and Judiciary Committee';
  if (e.kind === 'subcommittee') return subcommitteeName(view, e.institutionId);
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

/** Open bills the team follows, most pressing first: response level, then the nearest meeting. */
export function rankedBills(view: View, clientId: string, since: string): RankedBill[] {
  const eng = view.list('Engagement', (e) => e.clientId === clientId)[0];
  if (!eng) return [];
  return view.targets(eng.id, 'watches').filter((o) => o.type === 'Bill' && !CLOSED.includes(o.stage))
    .map((bill) => ({ bill, level: responseLevel(view, bill.id, clientId, since).level, facts: responseFacts(view, bill.id, clientId, since) }))
    .sort((x, y) => LEVEL_RANK[x.level] - LEVEL_RANK[y.level] || (daysToStep(x.facts) ?? 99) - (daysToStep(y.facts) ?? 99) || cmp(x.bill.id, y.bill.id));
}

/** The week in one line and a sentence, written from the most pressing followed bill. */
export function headline(view: View, clientId: string, top?: RankedBill): { headline: string; lead: string } {
  if (!top) return { headline: 'No followed bill moves this week', lead: '' };
  const { bill, facts: f } = top;
  const name = `The ${lower1(billName(bill))}`;
  const goes = f.slotKind === 'introduction' ? 'is introduced at the' : f.slotKind === 'wording' ? 'goes for wording review to the' : 'goes to the';
  const h = f.slot ? `${name} ${goes} ${forumOf(view, f.slot)} on ${monthDay(f.slot.date)}` : `${name} is ${NOW[bill.stage] ?? 'pending'}`;
  const lead = f.change ? `It ${PAST[f.change.to] ?? 'moved'} on ${monthDay(f.change.date)}.` : f.position ? `${view.get(clientId)!.name} ${WANTS[f.position.stance]}.` : '';
  return { headline: h, lead };
}

export const decisionsLine = (n: number) => (n === 0 ? 'No decision for leadership this week.' : `${countWord(n)} decision${n === 1 ? '' : 's'} for leadership this week.`);

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

/**
 * The document a fact comes from. A bill with a meeting ahead cites the notice for that meeting, since that is what the
 * reader acts on; otherwise the latest record naming the bill. A meeting cites its own notice. Only confirmed items count:
 * routed before this week, or filed for the client (see confirmedSignals).
 */
export function sourceFor(view: View, id: string): string | undefined {
  const o = view.get(id);
  if (!o) return undefined;
  const sigs = confirmedSignals(view).filter((s) => s.collectedAt.slice(0, 10) <= view.baseDate);
  const latest = (xs: ObjectRecord[]) => xs.sort((a, b) => cmp(b.collectedAt, a.collectedAt) || cmp(b.id, a.id))[0]?.id;
  const noticeOf = (e: ObjectRecord) => latest(sigs.filter((s) => s.rawText.includes(e.name) && s.rawText.includes(monthDay(e.date))));
  if (o.type === 'Bill') {
    const next = view.sources(o.id, 'agenda_item').filter((e) => SLOT_KINDS.includes(e.kind) && e.status === 'scheduled' && e.date >= view.baseDate)
      .sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id))[0];
    return (next && noticeOf(next)) ?? latest(sigs.filter((s) => ['bill_update', 'public_notice'].includes(s.sourceType) && (o.billNo ? s.rawText.includes(o.billNo) : s.rawText.includes(o.title))));
  }
  if (o.type === 'Event') return noticeOf(o) ?? (o.kind === 'public_comment' ? view.targets(o.id, 'agenda_item').map((b) => sourceFor(view, b.id)).find(Boolean) : undefined);
  if (o.type === 'RiskOpportunity') return (o.subjectIds as string[]).map((s) => sourceFor(view, s)).find(Boolean);
  return undefined;
}
const SLOT_KINDS = ['full_committee', 'subcommittee', 'plenary'];

/** The timeline and the report's Coming up list both cover this many days from the as-of date, that date included. */
export const TIMELINE_DAYS = 30;
/** internal: the GR team's own work and open decisions; the report to leadership leaves them out. */
export interface TimelineItem { date: string; title: string; who: string; status: string; id: string; urgent?: boolean; internal?: boolean }
export const OWNER: Record<string, string> = { human: 'Our team', agent: 'Assistant', client: 'Other teams' };
/** A task needed from another team names it after a middle dot: "Cargo model data · Engineering". */
export const splitTeam = (title: string): { what: string; team?: string } => {
  const [what, team] = title.split(' · ');
  return { what, team };
};
const STEP_NOTE: Record<string, string> = { introduction: 'introduction only, no vote', wording: 'wording review only', plenary: 'plenary vote on the settled text' };
/** "Full committee: A, B; C (introduction only, no vote)". Bills whose step is a review or a vote are listed plainly. */
function meetingTitle(view: View, what: string, e: ObjectRecord, billIds: string[]): string {
  const groups = new Map<string, string[]>();
  for (const id of billIds) { const k = stepKind(e, view.get(id)!); const g = k === 'review' || k === 'vote' ? '' : STEP_NOTE[k]; groups.set(g, [...(groups.get(g) ?? []), billName(view.get(id))]); }
  const plain = groups.get('') ?? [];
  const rest = [...groups].filter(([g]) => g).map(([g, names]) => `${names.join(', ')} (${g})`);
  if (!plain.length && groups.size === 1) return `${what} (${[...groups.keys()][0]}): ${groups.get([...groups.keys()][0])!.join(', ')}`;
  return `${what}: ${[plain.join(', '), ...rest].filter(Boolean).join('; ')}`;
}

/**
 * Dated items from the as-of date through the next TIMELINE_DAYS days: meetings on any bill that affects the company and is followed
 * or at engage or above, tasks (the GR team's and the ones needed from other teams), and open decisions. An item is urgent when such a bill
 * is at engage or above and its step falls within 7 days. Output for leadership leaves out the GR team's own tasks and open decisions.
 */
export function timeline(view: View, clientId: string, opts: { clientFacing?: boolean; since?: string } = {}): TimelineItem[] {
  const since = opts.since ?? addDays(view.baseDate, -7);
  const eng = view.list('Engagement', (e) => e.clientId === clientId)[0];
  const watched = new Set(eng ? view.targets(eng.id, 'watches').map((o) => o.id) : []);
  const levels = new Map<string, ResponseLevel>();
  const levelOf = (id: string) => levels.get(id) ?? levels.set(id, responseLevel(view, id, clientId, since).level).get(id)!;
  const pressing = (id: string) => LEVEL_RANK[levelOf(id)] <= LEVEL_RANK.engage;
  const items: TimelineItem[] = [];
  for (const x of view.list('Decision', (d) => d.clientId === clientId && d.status === 'open' && d.dueDate && d.dueDate <= addDays(view.baseDate, TIMELINE_DAYS))) {
    items.push({ date: x.dueDate, title: `Decision due: ${String(x.followUp ?? x.question).replace(/\?$/, '')}`, who: 'Leadership', status: 'To decide', id: x.id, internal: true });
  }
  for (const d of upcomingDeadlines(view, clientId, TIMELINE_DAYS)) {
    const o = view.get(d.objectId)!;
    if (d.kind === 'task') {
      const { what, team } = splitTeam(o.title);
      items.push({ date: d.date, title: what, who: o.owner === 'client' ? team ?? OWNER.client : OWNER[o.owner], status: 'To do', id: o.id, ...(o.owner === 'client' ? {} : { internal: true }) });
      continue;
    }
    const bills = d.billIds.filter((b) => watched.has(b) || pressing(b));
    if (!bills.length && o.kind !== 'hearing') continue;
    const inst = view.get(o.institutionId);
    const what = o.kind === 'public_comment' ? 'Notice period closes' : o.kind === 'hearing' ? o.name : cap(forumOf(view, o));
    const plainMeeting = o.kind === 'hearing' || o.kind === 'public_comment';
    items.push({
      date: d.date, title: !bills.length || o.kind === 'hearing' ? what : plainMeeting ? `${what}: ${bills.map((id) => billName(view.get(id))).join(', ')}` : meetingTitle(view, what, o, bills), who: inst && ['ministry', 'agency'].includes(inst.kind) ? 'Government' : 'National Assembly', status: 'Scheduled', id: o.id,
      ...(d.daysLeft <= 7 && bills.some(pressing) ? { urgent: true } : {}),
    });
  }
  // A stable sort by date: on one day the decisions come first, then meetings and tasks in record order.
  return items.filter((x) => !(opts.clientFacing && x.internal)).sort((a, b) => cmp(a.date, b.date));
}

export interface Move { subject: ObjectRecord; stance: string; date: string; text: string; at?: string; sourceId?: string; issueTitle?: string }
const issueOf = (view: View, sig: ObjectRecord): string | undefined => view.targets(sig.id, 'about')[0]?.title;
const sentences = (text: string) => text.split(/(?<=\.)\s+/);
// What an item records someone doing: only where that person is its subject (named in the headline) or the speaker in an
// official record (minutes). A remark quoted inside a story about someone else is not that person's move.
const actBy = (sig: ObjectRecord, name: string) =>
  sig.title.includes(name) || sig.sourceType === 'minutes' ? sentences(sig.rawText).find((x) => x.includes(name)) : undefined;
// What someone said at a meeting: the record's own sentence about them, beyond the line that lists them as a speaker.
const remarkAt = (view: View, subjectId: string, eventId: string, name: string) =>
  view.links({ type: 'testifies_at', from: subjectId, to: eventId }).flatMap((l) => l.evidence.map((id) => String(view.get(id)?.excerpt ?? '')))
    .flatMap(sentences).find((x) => x.startsWith(name) && !/ lists /.test(x));

/** Assessed people and organizations who did something this week: the subject of a confirmed item, spoke at a meeting, met the team. */
export function moves(view: View, clientId: string, since: string): Move[] {
  const inWeek = (d: string) => d.slice(0, 10) > since && d.slice(0, 10) <= view.baseDate;
  const week = confirmedSignals(view).filter((x) => inWeek(x.collectedAt));
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const a of view.list('StakeholderAssessment', (x) => x.clientId === clientId).sort((x, y) => cmp(x.id, y.id))) {
    if (seen.has(a.subjectId)) continue;
    const s = view.get(a.subjectId)!;
    const acts = [
      ...week.flatMap((x) => { const t = actBy(x, s.name); return t ? [{ date: x.collectedAt.slice(0, 10), text: t, sourceId: x.id, issueTitle: issueOf(view, x) }] : []; }),
      ...view.targets(s.id, 'testifies_at').filter((e) => e.status === 'held' && inWeek(e.date)).flatMap((e) => {
        const said = remarkAt(view, s.id, e.id, s.name);
        return said ? [{ date: e.date, text: said, at: e.name, sourceId: sourceFor(view, e.id), issueTitle: view.targets(e.id, 'about')[0]?.title }] : [];
      }),
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
    timeline: timeline(view, clientId, { ...opts, since }),
    moves: moves(view, clientId, since),
    asks: asks(view, clientId),
  };
}
