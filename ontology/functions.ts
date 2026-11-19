// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Ontology functions: deterministic, read-only, and always returned with their working.
import type { LinkRecord, ObjectRecord, View } from './runtime.ts';
import { addDays, daysBetween } from './dates.ts';
import { SOURCE_TYPES, STAGE_ORDER } from './schema.ts';

// ---- Risk score: a published weighted sum, not a model ----
export const RISK_WEIGHTS = { stage: 40, calendar: 20, position: 20, impact: 20 } as const;

// How far along the path to enactment each stage is.
export const STAGE_PROGRESS: Record<string, number> = {
  public_comment: 0.08, submitted: 0.12, committee_referred: 0.2, committee_review: 0.32, subcommittee: 0.5,
  subcommittee_passed: 0.62, committee_passed: 0.72, lj_review: 0.82, plenary_pending: 0.92, passed: 1,
  merged_alternative: 0.35, // the bill is gone; its content lives in the committee alternative
  withdrawn: 0,
};
// Positions that call for action raise exposure; support lowers it.
export const POSITION_VALUE: Record<string, number> = { oppose: 1, amend: 0.7, monitor: 0.3, support: 0.1 };
export const NO_POSITION_VALUE = 0.3;
export const IMPACT_VALUE: Record<string, number> = { high: 1, medium: 0.6, low: 0.3 };

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
/** Code-point order. localeCompare depends on the runtime's ICU data; ties must sort the same everywhere. */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const TERMINAL = ['passed', 'merged_alternative', 'withdrawn'];

// Links whose only support is evidence still waiting in the review queue do not count yet.
// Client-layer links carry no evidence by design and always count.
const supported = (view: View, l: LinkRecord) => !l.evidence.length || l.evidence.some((id) => view.get(id)?.reviewStatus === 'accepted');

/** The view functions compute on: the caller's view minus links that rest only on unreviewed evidence. */
const confirmed = new WeakSet<View>();
export function confirmedView(view: View): View {
  if (confirmed.has(view)) return view; // functions call each other; wrap once
  const links: View['links'] = (q) => view.links(q).filter((l) => supported(view, l));
  const v: View = {
    ...view,
    links,
    targets: (id, t) => links({ type: t, from: id }).map((l) => view.get(l.to)!),
    sources: (id, t) => links({ type: t, to: id }).map((l) => view.get(l.from)!),
  };
  confirmed.add(v);
  return v;
}

/** Ids of signals the caller's companies have handled (filed or set aside), from their SignalTriage records. */
export function handledSignals(view: View, status: readonly string[] = ['filed', 'set_aside']): Set<string> {
  return new Set(view.list('SignalTriage', (t) => status.includes(t.status)).map((t) => t.signalId));
}

/** Items a brief, report or decision may rest on: routed by the collector before this week, or filed for the company. Items still waiting to be confirmed do not count. */
export function confirmedSignals(view: View): ObjectRecord[] {
  const filed = handledSignals(view, ['filed']);
  const setAside = handledSignals(view, ['set_aside']);
  return view.list('Signal', (s) => !setAside.has(s.id) && (s.status === 'triaged' || filed.has(s.id)));
}

/** The company's queue: new items its triage has not handled yet. The same for every company, since triage never edits the public Signal. */
export function signalQueue(view: View): ObjectRecord[] {
  const handled = handledSignals(view);
  return view.list('Signal', (s) => s.status === 'new' && !handled.has(s.id)).sort((a, b) => cmp(a.collectedAt, b.collectedAt) || cmp(a.id, b.id));
}

function need(view: View, id: string): ObjectRecord {
  const o = view.get(id);
  if (!o) throw new Error(`${id} does not exist or is not accessible to ${view.ctx.actor}`);
  return o;
}

export function stageAt(bill: ObjectRecord, asOf: string): string {
  const hist: { stage: string; date: string }[] = bill.stageHistory;
  return [...hist].reverse().find((h) => h.date <= asOf)?.stage ?? 'submitted';
}

/** Bills that touch an issue which affects this client. */
export function clientBills(view: View, clientId: string): ObjectRecord[] {
  view = confirmedView(view);
  const seen = new Map<string, ObjectRecord>();
  for (const issue of view.sources(clientId, 'affects')) {
    for (const b of view.sources(issue.id, 'about')) if (b.type === 'Bill') seen.set(b.id, b);
  }
  return [...seen.values()].sort((a, b) => cmp(a.id, b.id));
}

export interface RiskComponent { key: keyof typeof RISK_WEIGHTS; label: string; weight: number; value: number; points: number; note: string }
export interface RiskScore { billId: string; clientId: string; asOf: string; stage: string; score: number; components: RiskComponent[] }

export function billRiskScore(view: View, billId: string, clientId: string, asOf: string = view.baseDate): RiskScore {
  view = confirmedView(view);
  const bill = need(view, billId);
  need(view, clientId);
  const stage = stageAt(bill, asOf);
  const issues = view.targets(billId, 'about');

  // Calendar: the nearest committee, subcommittee, hearing or plenary agenda slot within 30 days after asOf.
  // A meeting held since asOf was still ahead on asOf, so status only matters for a meeting on asOf itself.
  // The calendar is today's: a back-dated score assumes meetings were already known then.
  const slots = view.sources(billId, 'agenda_item')
    .filter((e) => (e.date > asOf || (e.date === asOf && e.status === 'scheduled')) && e.date <= addDays(asOf, 30) && ['full_committee', 'subcommittee', 'hearing', 'plenary'].includes(e.kind))
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id));
  const nextSlot = slots[0];
  const days = nextSlot ? daysBetween(asOf, nextSlot.date) : undefined;
  const calendar = days === undefined ? 0 : days <= 7 ? 1 : days <= 14 ? 0.6 : 0.3;

  // Position: a stance on the bill wins over a stance on its issue.
  const positions = view.list('ClientPosition', (p) => p.clientId === clientId);
  const pos = positions.find((p) => p.targetId === billId) ?? positions.find((p) => issues.some((i) => i.id === p.targetId));

  // Impact: the strongest impact among the bill's issues on this client.
  const impacts = issues.flatMap((i) => view.links({ type: 'affects', from: i.id, to: clientId }).map((l) => l.props?.impact as string));
  const impact = Math.max(0, ...impacts.map((i) => IMPACT_VALUE[i] ?? 0));

  const mk = (key: RiskComponent['key'], label: string, value: number, note: string): RiskComponent =>
    ({ key, label, weight: RISK_WEIGHTS[key], value: round(value), points: round(RISK_WEIGHTS[key] * value), note });
  const components = [
    mk('stage', 'Stage progress', STAGE_PROGRESS[stage] ?? 0, `Stage '${stage}' as of ${asOf}`),
    mk('calendar', 'Committee calendar', calendar, nextSlot ? `${nextSlot.name} in ${days} days (${nextSlot.date})` : 'Nothing scheduled in the next 30 days'),
    mk('position', 'Company position', pos ? POSITION_VALUE[pos.stance] : NO_POSITION_VALUE, pos ? `Company stance: ${pos.stance} (${pos.targetId})` : 'No stated position; treated as monitor'),
    mk('impact', 'Issue impact', impact, impact ? `Strongest linked issue impact: ${Object.entries(IMPACT_VALUE).find(([, v]) => v === impact)?.[0]}` : 'No linked issue affects this company'),
  ];
  return { billId, clientId, asOf, stage, score: round(components.reduce((s, c) => s + c.points, 0)), components };
}

// ---- responseLevel: a category from rules, not a number ----
// GR judgment does not reduce to a score, so the level is decided by explicit rules a consultant would name.
export type ResponseLevel = 'act_now' | 'engage' | 'monitor' | 'watch';
const SLOT_KINDS = ['full_committee', 'subcommittee', 'plenary'];
const ACTION_STANCES = ['oppose', 'amend'];

/**
 * What a meeting does to a bill.
 * introduction: the full committee takes up a bill that was only referred (상정, proposer's statement, expert review report); no vote.
 * review:       the bill review subcommittee deliberates and writes the text (소위 심사, 의결); the main place where text changes.
 * vote:         the full committee votes on a bill its subcommittee has passed (전체회의 의결).
 * wording:      the Legislation and Judiciary Committee checks system and wording only (체계·자구 심사) and can hold a bill back (계류).
 * plenary:      the plenary votes the text as it stands.
 */
export type StepKind = 'introduction' | 'review' | 'vote' | 'wording' | 'plenary';
export function stepKind(meeting: ObjectRecord, bill: ObjectRecord): StepKind {
  if (meeting.institutionId === 'inst-ljc') return 'wording';
  if (meeting.kind === 'plenary') return 'plenary';
  if (meeting.kind === 'subcommittee') return 'review';
  return ['submitted', 'committee_referred'].includes(bill.stage) ? 'introduction' : 'vote';
}
/** Steps where the text can still change: the subcommittee's review and the full committee's vote. */
export const isDecisive = (k: StepKind) => k === 'review' || k === 'vote';

export interface ResponseFacts {
  closed: boolean; // passed, merged or withdrawn
  textOpen: boolean; // the text can still change in substance: the full committee has not yet passed it
  change?: { from: string | undefined; to: string; date: string }; // latest stage change after since
  slot?: ObjectRecord; // next committee, subcommittee or plenary meeting with the bill on the agenda
  slotKind?: StepKind;
  daysToSlot?: number;
  decisive?: ObjectRecord; // next meeting where the text is reviewed or voted (see isDecisive)
  daysToDecisive?: number;
  notice?: ObjectRecord; // an open legislative notice period on the bill, closing on notice.date
  daysToNotice?: number;
  position?: ObjectRecord; // a stance on the bill wins over a stance on its issue
  impact?: string; // strongest affects impact among the bill's issues
}

/** The facts responseLevel decides on. since defaults to one week before the base date ("this week"). */
export function responseFacts(view: View, billId: string, clientId: string, since: string = addDays(view.baseDate, -7)): ResponseFacts {
  view = confirmedView(view);
  const bill = need(view, billId);
  need(view, clientId);
  const asOf = view.baseDate;
  const hist: { stage: string; date: string }[] = bill.stageHistory;
  const i = hist.findLastIndex((h) => h.date > since && h.date <= asOf);
  const meetings = view.sources(billId, 'agenda_item')
    .filter((e) => SLOT_KINDS.includes(e.kind) && (e.date > asOf || (e.date === asOf && e.status === 'scheduled')))
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id));
  const slot = meetings[0];
  const decisive = meetings.find((e) => isDecisive(stepKind(e, bill)));
  const notice = view.sources(billId, 'agenda_item')
    .filter((e) => e.kind === 'public_comment' && e.status === 'scheduled' && e.date >= asOf)
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id))[0];
  const issues = view.targets(billId, 'about');
  const positions = view.list('ClientPosition', (p) => p.clientId === clientId);
  const impacts = issues.flatMap((x) => view.links({ type: 'affects', from: x.id, to: clientId }).map((l) => l.props?.impact as string));
  const closed = TERMINAL.includes(bill.stage);
  const order = (s: string) => (STAGE_ORDER as readonly string[]).indexOf(s);
  return {
    closed,
    textOpen: !closed && order(bill.stage) < order('committee_passed'),
    ...(i >= 0 ? { change: { from: hist[i - 1]?.stage, to: hist[i].stage, date: hist[i].date } } : {}),
    ...(slot ? { slot, slotKind: stepKind(slot, bill), daysToSlot: daysBetween(asOf, slot.date) } : {}),
    ...(decisive ? { decisive, daysToDecisive: daysBetween(asOf, decisive.date) } : {}),
    ...(notice ? { notice, daysToNotice: daysBetween(asOf, notice.date) } : {}),
    position: positions.find((p) => p.targetId === billId) ?? positions.find((p) => issues.some((x) => x.id === p.targetId)),
    impact: ['high', 'medium', 'low'].find((lvl) => impacts.includes(lvl)),
  };
}

const minDays = (...xs: (number | undefined)[]): number | undefined => {
  const d = xs.filter((x): x is number => x !== undefined);
  return d.length ? Math.min(...d) : undefined;
};
/** Days to the bill's next scheduled step of any kind: a meeting with it on the agenda, or the close of an open legislative notice period. */
export const daysToStep = (f: ResponseFacts): number | undefined => minDays(f.daysToSlot, f.daysToNotice);
/** Days to the next step where the text can still change in substance: the subcommittee's review, the full committee's vote, or the close of a notice period. */
export const daysToDecisiveStep = (f: ResponseFacts): number | undefined => minDays(f.daysToDecisive, f.daysToNotice);
/** Days to the next step worth preparing for: a decisive step, or the full committee taking the bill up for the first time. */
export const daysToPrepare = (f: ResponseFacts): number | undefined =>
  minDays(daysToDecisiveStep(f), f.slotKind === 'introduction' ? f.daysToSlot : undefined);

const STEP_NOTE: Record<StepKind, string> = {
  introduction: 'first 상정, no vote', review: 'subcommittee review', vote: 'full committee vote', wording: 'wording review only', plenary: 'plenary vote on the settled text',
};

/**
 * A step is a committee or subcommittee meeting with the bill on the agenda, or the close of an open legislative notice period
 * (the last easy moment to file comments on a government bill: the ministry must consider them but is not bound, and the text can
 * still change in regulatory review, the Ministry of Government Legislation review and the Cabinet). A step is decisive when the
 * text can still change there: the subcommittee's review, the full committee's vote on a bill its subcommittee passed, or the notice.
 * A first 상정 at the full committee is not a decision, and the Legislation and Judiciary Committee and the plenary only check
 * wording or vote on a settled text.
 * act_now: a decisive step within 7 days, the client wants it changed (oppose or amend), and either it moved this week or the
 *          client opposes it and the impact is high (a bill that sat still can still be voted on).
 * engage:  the text is open and either the client wants it changed and it moved this week or has a decisive step or first 상정
 *          within 30 days; or the impact is high with a decisive step or first 상정 within 10 days (support included).
 * monitor: it moved this week, has any step within 30 days, the client wants it changed, or the impact is high.
 *          A bill whose text is settled (past the full committee) stays here at most: only wording and delay risk are left.
 * watch:   none of the above, or the bill is closed.
 */
export function responseLevel(view: View, billId: string, clientId: string, since?: string): { level: ResponseLevel; reasons: string[] } {
  const f = responseFacts(view, billId, clientId, since);
  const reasons: string[] = [];
  if (f.closed) return { level: 'watch', reasons: [`Bill is closed (${view.get(billId)!.stage})`] };
  const moved = !!f.change;
  const step = daysToStep(f);
  const decisive = daysToDecisiveStep(f);
  const prepare = daysToPrepare(f);
  const wantsChange = !!f.position && ACTION_STANCES.includes(f.position.stance);
  const high = f.impact === 'high';
  reasons.push(moved ? `Moved to ${f.change!.to} on ${f.change!.date}` : 'No stage change this week');
  reasons.push(f.slot && f.daysToSlot! <= 30 ? `${f.slot.name} on ${f.slot.date} (${f.daysToSlot} days; ${STEP_NOTE[f.slotKind!]})` : 'No committee, subcommittee or plenary slot in the next 30 days');
  if (f.notice && f.daysToNotice! <= 30) reasons.push(`Notice period closes on ${f.notice.date} (${f.daysToNotice} days)`);
  reasons.push(f.position ? `Company stance: ${f.position.stance}${f.position.targetId === billId ? '' : ` (on ${f.position.targetId})`}` : 'No company stance recorded');
  reasons.push(f.impact ? `Issue impact: ${f.impact}` : 'No linked issue affects this company');
  if (!f.textOpen) reasons.push('The text is settled: only wording and delay risk are left, so the level stays at monitor or below');
  const within = (d: number | undefined, n: number) => d !== undefined && d <= n;
  const level: ResponseLevel = f.textOpen && within(decisive, 7) && wantsChange && (moved || (f.position!.stance === 'oppose' && high)) ? 'act_now'
    : f.textOpen && ((wantsChange && (moved || within(prepare, 30))) || (high && within(prepare, 10))) ? 'engage'
      : moved || within(step, 30) || wantsChange || high ? 'monitor'
        : 'watch';
  return { level, reasons };
}

// ---- keyPeople ----
export interface KeyPerson { personId: string; name: string; kind: string; party?: string; score: number; reasons: string[] }

export function keyPeople(view: View, billId: string, limit = 8): KeyPerson[] {
  view = confirmedView(view);
  const bill = need(view, billId);
  const acc = new Map<string, KeyPerson>();
  const add = (p: ObjectRecord, pts: number, reason: string) => {
    const e = acc.get(p.id) ?? { personId: p.id, name: p.name, kind: p.kind, party: p.party, score: 0, reasons: [] as string[] };
    e.score = round(e.score + pts);
    if (!e.reasons.includes(reason)) e.reasons.push(reason);
    acc.set(p.id, e);
  };

  for (const p of view.sources(billId, 'sponsors').filter((x) => x.type === 'Person')) add(p, 5, 'Lead sponsor');
  for (const p of view.sources(billId, 'cosponsors')) add(p, 1, 'Cosponsor');

  // Gatekeepers: chair and secretaries of the referred committee and its subcommittees.
  const committee = view.targets(billId, 'referred_to')[0];
  const bodies = committee ? [committee, ...view.list('Institution', (i) => i.parentId === committee.id)] : [];
  for (const body of bodies) {
    for (const l of view.links({ type: 'member_of', to: body.id })) {
      if (l.props?.until && l.props.until < view.baseDate) continue;
      const p = view.get(l.from);
      if (!p) continue;
      const sub = body.kind === 'subcommittee';
      if (l.props?.role === 'chair') add(p, sub ? 4 : 3, `Chair of ${body.name}`);
      else if (l.props?.role === 'secretary') add(p, 3, `Secretary of ${body.name}`);
      else add(p, 1, `Member of ${body.name}`);
    }
  }

  // Voice: speakers at events that had this bill on the agenda, and names that recur in signals about it.
  for (const ev of view.sources(billId, 'agenda_item')) {
    for (const p of view.sources(ev.id, 'testifies_at').filter((x) => x.type === 'Person')) add(p, 1, `Spoke at ${ev.name}`);
  }
  const mentions = new Map<string, number>();
  for (const sig of view.sources(billId, 'mentions')) {
    for (const p of view.targets(sig.id, 'mentions').filter((x) => x.type === 'Person')) mentions.set(p.id, (mentions.get(p.id) ?? 0) + 1);
  }
  for (const [pid, n] of [...mentions].sort()) add(view.get(pid)!, Math.min(n, 4) * 0.5, `Named in ${n} item${n > 1 ? 's' : ''} about the ${bill.shortTitle ?? bill.title}`);

  return [...acc.values()].sort((a, b) => b.score - a.score || cmp(a.name, b.name)).slice(0, limit);
}

// ---- upcomingDeadlines ----
export interface Deadline { date: string; daysLeft: number; kind: 'task' | 'event'; title: string; objectId: string; billIds: string[]; owner?: string }

export function upcomingDeadlines(view: View, clientId: string, days = 30): Deadline[] {
  view = confirmedView(view);
  need(view, clientId);
  const from = view.baseDate;
  const to = addDays(from, days);
  const out: Deadline[] = [];
  for (const t of view.list('Task', (t) => t.clientId === clientId && t.status === 'open' && t.dueDate <= to)) {
    out.push({ date: t.dueDate, daysLeft: daysBetween(from, t.dueDate), kind: 'task', title: t.title, objectId: t.id, billIds: [], owner: t.owner });
  }
  const bills = clientBills(view, clientId);
  const events = new Map<string, ObjectRecord>();
  for (const b of bills) for (const e of view.sources(b.id, 'agenda_item')) events.set(e.id, e);
  for (const issue of view.sources(clientId, 'affects')) for (const e of view.sources(issue.id, 'about')) if (e.type === 'Event') events.set(e.id, e);
  for (const e of events.values()) {
    if (e.status !== 'scheduled' || e.date < from || e.date > to) continue;
    const billIds = view.targets(e.id, 'agenda_item').filter((b) => bills.some((x) => x.id === b.id)).map((b) => b.id);
    out.push({ date: e.date, daysLeft: daysBetween(from, e.date), kind: 'event', title: e.name, objectId: e.id, billIds });
  }
  return out.sort((a, b) => cmp(a.date, b.date) || cmp(a.objectId, b.objectId));
}

// ---- issueExposure ----
export interface Exposure {
  issueId: string; title: string; impact: string; activeBills: number; maxRisk: number; topBillId?: string;
  exposure: number; billRisks: { billId: string; score: number }[];
}

export function issueExposure(view: View, clientId: string): Exposure[] {
  view = confirmedView(view);
  need(view, clientId);
  return view.links({ type: 'affects', to: clientId }).map((l) => {
    const issue = view.get(l.from)!;
    const bills = view.sources(issue.id, 'about').filter((b) => b.type === 'Bill' && !TERMINAL.includes(b.stage));
    const billRisks = bills.map((b) => ({ billId: b.id, score: billRiskScore(view, b.id, clientId).score })).sort((a, b) => b.score - a.score || cmp(a.billId, b.billId));
    const maxRisk = billRisks[0]?.score ?? 0;
    // Exposure is the worst bill's risk plus 3 points for each further active bill, capped at 100.
    const exposure = billRisks.length ? Math.min(100, round(maxRisk + 3 * (billRisks.length - 1), 1)) : 0;
    return { issueId: issue.id, title: issue.title, impact: l.props?.impact, activeBills: billRisks.length, maxRisk, topBillId: billRisks[0]?.billId, exposure, billRisks };
  }).sort((a, b) => b.exposure - a.exposure || cmp(a.issueId, b.issueId));
}

// ---- whatChanged ----
export interface WhatChanged {
  since: string;
  until: string;
  stageChanges: { billId: string; title: string; from: string | undefined; to: string; date: string }[];
  signals: { total: number; byStatus: Record<string, number>; bySource: Record<string, number>; ids: string[] };
  eventsHeld: { id: string; name: string; date: string; kind: string }[];
  eventsUpcoming: { id: string; name: string; date: string; kind: string }[];
  riskChanges: { clientId: string; billId: string; before: number; after: number; delta: number }[];
}

/** Everything after `since` (exclusive) up to `until` (inclusive, default the base date). */
export function whatChanged(view: View, since: string, until: string = view.baseDate): WhatChanged {
  view = confirmedView(view);
  const inWindow = (d: string) => d > since && d <= until;
  const stageChanges: WhatChanged['stageChanges'] = [];
  for (const b of view.list('Bill')) {
    const hist: { stage: string; date: string }[] = b.stageHistory;
    hist.forEach((h, i) => inWindow(h.date) && stageChanges.push({ billId: b.id, title: b.title, from: hist[i - 1]?.stage, to: h.stage, date: h.date }));
  }
  stageChanges.sort((a, b) => cmp(a.date, b.date) || cmp(a.billId, b.billId));

  const sigs = view.list('Signal', (s) => inWindow(s.collectedAt.slice(0, 10))).sort((a, b) => cmp(a.collectedAt, b.collectedAt) || cmp(a.id, b.id));
  const tally = (key: string) => sigs.reduce<Record<string, number>>((m, s) => ((m[s[key]] = (m[s[key]] ?? 0) + 1), m), {});
  const brief = (e: ObjectRecord) => ({ id: e.id, name: e.name, date: e.date, kind: e.kind });
  const byDate = (a: { date: string; id: string }, b: { date: string; id: string }) => cmp(a.date, b.date) || cmp(a.id, b.id);

  const riskChanges: WhatChanged['riskChanges'] = [];
  for (const c of view.list('Client')) {
    for (const b of clientBills(view, c.id)) {
      const before = billRiskScore(view, b.id, c.id, since).score;
      const after = billRiskScore(view, b.id, c.id, until).score;
      if (Math.abs(after - before) >= 1) riskChanges.push({ clientId: c.id, billId: b.id, before, after, delta: round(after - before) });
    }
  }
  riskChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || cmp(a.billId, b.billId));

  return {
    since, until, stageChanges,
    signals: { total: sigs.length, byStatus: tally('status'), bySource: tally('sourceType'), ids: sigs.map((s) => s.id) },
    eventsHeld: view.list('Event', (e) => e.status === 'held' && inWindow(e.date)).map(brief).sort(byDate),
    eventsUpcoming: view.list('Event', (e) => e.status === 'scheduled' && e.date > until && e.date <= addDays(until, 7)).map(brief).sort(byDate),
    riskChanges,
  };
}

// ---- stageGates: who decides at each stage ----
export type GateKey = 'subcommittee' | 'committee' | 'lj' | 'plenary';
export interface Decider { id: string; name: string; role: string }
export interface StageGate {
  key: GateKey;
  institutionId?: string;
  status: 'done' | 'next' | 'later' | 'closed';
  date?: string; // the day it cleared this stage, or the scheduled meeting
  scheduled: boolean; // date is a scheduled meeting
  deciders: Decider[]; // chair first, then secretaries; the plenary is decided by the whole chamber
}

// The stage a bill reaches once it clears each gate.
const GATE_CLEARED: Record<GateKey, string> = { subcommittee: 'subcommittee_passed', committee: 'committee_passed', lj: 'plenary_pending', plenary: 'passed' };
const ROLE_RANK: Record<string, number> = { chair: 0, secretary: 1 };

export function stageGates(view: View, billId: string): StageGate[] {
  view = confirmedView(view);
  const bill = need(view, billId);
  const hist: { stage: string; date: string }[] = bill.stageHistory;
  const order = (s: string) => (STAGE_ORDER as readonly string[]).indexOf(s);
  const committee = view.targets(billId, 'referred_to')[0];
  const sub = committee ? view.list('Institution', (i) => i.parentId === committee.id && i.kind === 'subcommittee')[0] : undefined;
  const lj = view.list('Institution', (i) => i.id === 'inst-ljc')[0];
  const plenary = view.list('Institution', (i) => i.kind === 'plenary')[0];
  const bodies: Record<GateKey, ObjectRecord | undefined> = { subcommittee: sub, committee, lj, plenary };
  const closed = ['merged_alternative', 'withdrawn'].includes(bill.stage);

  let nextSeen = false;
  return (Object.keys(GATE_CLEARED) as GateKey[]).map((key) => {
    const body = bodies[key];
    const cleared = hist.find((h) => h.stage === GATE_CLEARED[key]);
    const done = !closed && order(bill.stage) >= order(GATE_CLEARED[key]);
    // Only sittings count: a hearing at the committee is not the committee's meeting on the bill.
    const meeting = body && view.sources(billId, 'agenda_item')
      .filter((e) => SLOT_KINDS.includes(e.kind) && e.institutionId === body.id && e.status === 'scheduled' && e.date >= view.baseDate)
      .sort((a, b) => cmp(a.date, b.date))[0];
    const status: StageGate['status'] = closed ? 'closed' : done ? 'done' : nextSeen ? 'later' : 'next';
    if (status === 'next') nextSeen = true;
    const deciders = body && body.kind !== 'plenary'
      ? view.links({ type: 'member_of', to: body.id })
        .filter((l) => l.props?.role in ROLE_RANK && !(l.props?.until && l.props.until < view.baseDate))
        .map((l) => ({ id: l.from, name: view.get(l.from)?.name, role: l.props!.role as string }))
        .filter((d): d is Decider => !!d.name)
        .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || cmp(a.name, b.name))
      : [];
    return {
      key, ...(body ? { institutionId: body.id } : {}), status,
      ...(done && cleared ? { date: cleared.date } : meeting ? { date: meeting.date } : {}),
      scheduled: !done && !!meeting, deciders,
    };
  });
}

// ---- stakeholderNetwork: assessed stakeholders on one issue and how they are connected ----
export type ActorType = 'lawmaker' | 'official' | 'association' | 'civic' | 'academic';
export type RelationKind = 'cosponsor' | 'committee' | 'oversight' | 'advises' | 'appeared' | 'coalition';
export interface NetworkNode { assessment: ObjectRecord; subject: ObjectRecord; actor: ActorType }
export interface NetworkEdge { a: string; b: string; kind: RelationKind; basisIds: string[] }

/** What kind of actor a stakeholder is. Research bodies count as academic, unions and companies as associations. */
export function actorType(o: ObjectRecord): ActorType {
  if (o.type === 'StakeholderOrg') return o.kind === 'ngo' ? 'civic' : o.kind === 'research' ? 'academic' : 'association';
  return ({ lawmaker: 'lawmaker', official: 'official', academic: 'academic' } as Record<string, ActorType>)[o.kind] ?? 'association';
}

/**
 * Edges come only from public links, one per pair, and each kind fits the two actor types it joins. In order of strength:
 * a joint statement (organizations), a shared bill, a shared committee (lawmakers), an advisory seat (academic and the
 * official or chair of that body), oversight (a lawmaker on the committee whose bills amend the official's provisions),
 * and appearing at the same event on the issue (any pair that is not two lawmakers).
 */
export function stakeholderNetwork(view: View, clientId: string, issueId: string): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
  view = confirmedView(view);
  need(view, clientId);
  need(view, issueId);
  const nodes = view.list('StakeholderAssessment', (a) => a.clientId === clientId && a.issueId === issueId)
    .map((assessment) => ({ assessment, subject: view.get(assessment.subjectId)! }))
    .filter((n) => n.subject)
    .map((n) => ({ ...n, actor: actorType(n.subject) }))
    .sort((x, y) => cmp(x.subject.id, y.subject.id));
  const live = (l: { props?: Record<string, any> }) => !(l.props?.until && l.props.until < view.baseDate);

  // Which committee oversees which ministry: bills referred to the committee amend provisions the ministry administers.
  const administers = new Map<string, Set<string>>();
  for (const l of view.links({ type: 'regulates' })) administers.set(l.to, new Set([...(administers.get(l.to) ?? []), l.from]));
  const overseers = new Map<string, Set<string>>();
  for (const r of view.links({ type: 'referred_to' })) {
    for (const am of view.links({ type: 'amends', from: r.from })) {
      for (const inst of administers.get(am.to) ?? []) overseers.set(inst, new Set([...(overseers.get(inst) ?? []), r.to]));
    }
  }
  const topBody = (id: string) => (view.get(id)?.kind === 'subcommittee' ? view.get(id)!.parentId : id);

  const issueBills = new Set(view.sources(issueId, 'about').filter((o) => o.type === 'Bill').map((o) => o.id));
  const issueEvents = new Set(view.sources(issueId, 'about').filter((o) => o.type === 'Event').map((o) => o.id));
  const statements = view.links({ type: 'coalition_with' }).filter((l) => l.props?.issueId === issueId);
  const facts = new Map(nodes.map((n) => {
    const id = n.subject.id;
    const seats = view.links({ type: 'member_of', from: id }).filter(live);
    return [id, {
      bills: [...view.links({ type: 'sponsors', from: id }), ...view.links({ type: 'cosponsors', from: id })].map((l) => l.to).filter((b) => issueBills.has(b)),
      bodies: seats.map((l) => l.to).filter((i) => ['committee', 'subcommittee'].includes(view.get(i)?.kind)),
      committees: seats.map((l) => topBody(l.to)).filter((i): i is string => !!i && view.get(i)?.kind === 'committee'),
      leads: seats.filter((l) => ['chair', 'official'].includes(l.props?.role)).map((l) => l.to),
      // Oversight runs through the people who set a committee's agenda, not every member.
      steers: seats.filter((l) => ['chair', 'secretary'].includes(l.props?.role)).map((l) => topBody(l.to)).filter((i): i is string => !!i),
      advised: view.links({ type: 'advises', from: id }).map((l) => l.to),
      events: view.links({ type: 'testifies_at', from: id }).map((l) => l.to).filter((e) => issueEvents.has(e)),
    }];
  }));
  const common = (x: string[], y: string[]) => [...new Set(x.filter((v) => y.includes(v)))].sort(cmp);

  const edges: NetworkEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const [x, y] = [nodes[i], nodes[j]];
      const [fx, fy] = [facts.get(x.subject.id)!, facts.get(y.subject.id)!];
      const kinds = new Set([x.actor, y.actor]);
      const both = (t: ActorType) => x.actor === t && y.actor === t;
      const [lawmaker, official] = x.actor === 'lawmaker' ? [fx, fy] : [fy, fx];
      const [academic, other] = x.actor === 'academic' ? [fx, fy] : [fy, fx];
      const ministry = [...(overseers.keys())].filter((m) => official.leads.includes(m));
      const coalition = statements.filter((l) => [x.subject.id, y.subject.id].every((id) => id === l.from || id === l.to)).flatMap((l) => l.evidence);
      const oversight = kinds.has('lawmaker') && kinds.has('official') && !both('lawmaker') && !both('official')
        ? ministry.flatMap((m) => common(lawmaker.steers, [...(overseers.get(m) ?? [])]).map((c) => [c, m])).flat() : [];
      const pairs: [RelationKind, string[]][] = [
        ['coalition', coalition],
        ['cosponsor', both('lawmaker') ? common(fx.bills, fy.bills) : []],
        ['advises', kinds.has('academic') && !both('academic') ? common(academic.advised, other.leads) : []],
        ['oversight', [...new Set(oversight)]],
        // Lawmakers at a hearing chair or question it; a line to every witness would only add noise.
        ['appeared', kinds.has('lawmaker') ? [] : common(fx.events, fy.events)],
      ];
      const hit = pairs.find(([, basis]) => basis.length);
      if (hit) edges.push({ a: x.subject.id, b: y.subject.id, kind: hit[0], basisIds: hit[1] });
    }
  }
  return { nodes, edges };
}

// ---- Monitoring profile and trial evaluation ----
export type Priority = 'high' | 'medium' | 'low';
export interface ProfileKeyword { term: string; priority: Priority; synonyms?: string[]; exclude?: string[] }
export interface ProfileObjective { text: string; priority: number }
export interface ProfileMatch { score: number; hits: { term: string; priority: Priority; via: string }[]; suppressed: { term: string; exclude: string }[] }
export const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0.6, medium: 0.45, low: 0.3 };

/** Case-insensitive phrase match. A term hits on itself or a synonym; an exclude phrase in the same text cancels that term. */
export function profileMatch(profile: { keywords: ProfileKeyword[] } | undefined, text: string): ProfileMatch {
  const lower = text.toLowerCase();
  const out: ProfileMatch = { score: 0, hits: [], suppressed: [] };
  for (const k of profile?.keywords ?? []) {
    const via = [k.term, ...(k.synonyms ?? [])].find((t) => lower.includes(t.toLowerCase()));
    if (!via) continue;
    const exclude = (k.exclude ?? []).find((e) => lower.includes(e.toLowerCase()));
    if (exclude) out.suppressed.push({ term: k.term, exclude });
    else out.hits.push({ term: k.term, priority: k.priority, via });
  }
  out.score = round(1 - out.hits.reduce((p, h) => p * (1 - PRIORITY_WEIGHT[h.priority]), 1));
  return out;
}

export const signalText = (s: ObjectRecord): string => `${s.title}. ${s.rawText}`;
export const monitoringProfile = (view: View, clientId: string): ObjectRecord | undefined => view.list('MonitoringProfile', (p) => p.clientId === clientId)[0];

/** The profile in the collector's input shape. */
export const ingestProfile = (p: ObjectRecord) => ({
  clientId: p.clientId as string, keywords: p.keywords as ProfileKeyword[], committees: p.committees as string[], agencies: p.agencies as string[],
  ...(p.sources ? { sources: p.sources as string[] } : {}),
});

/** Shape errors in profile fields; used by the action and the world validator. */
export function profileErrors(p: Record<string, unknown>): string[] {
  const e: string[] = [];
  const phrases = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim()));
  if (p.objectives !== undefined) {
    if (!Array.isArray(p.objectives)) e.push('objectives: expected a list');
    else p.objectives.forEach((o: any, i) => {
      if (typeof o?.text !== 'string' || !o.text.trim()) e.push(`objectives[${i}]: text required`);
      if (![1, 2, 3].includes(o?.priority)) e.push(`objectives[${i}]: priority must be 1, 2 or 3`);
    });
  }
  if (p.keywords !== undefined) {
    if (!Array.isArray(p.keywords)) e.push('keywords: expected a list');
    else {
      const seen = new Set<string>();
      p.keywords.forEach((k: any, i) => {
        if (typeof k?.term !== 'string' || !k.term.trim()) return void e.push(`keywords[${i}]: term required`);
        if (seen.has(k.term.toLowerCase())) e.push(`keywords[${i}]: '${k.term}' is listed twice`);
        seen.add(k.term.toLowerCase());
        if (!Object.hasOwn(PRIORITY_WEIGHT, k.priority)) e.push(`keywords[${i}]: priority must be high, medium or low`);
        if (!phrases(k.synonyms) || !phrases(k.exclude)) e.push(`keywords[${i}]: synonyms and exclude must be lists of phrases`);
      });
    }
  }
  if (p.sources !== undefined && (!Array.isArray(p.sources) || p.sources.some((s) => !(SOURCE_TYPES as readonly string[]).includes(s)))) e.push(`sources: each must be one of ${SOURCE_TYPES.join(', ')}`);
  return e;
}

const day = (s: ObjectRecord): string => s.collectedAt.slice(0, 10);

/** Items collected inside the window, from enabled sources, that hit the profile. */
export function pilotCatch(signals: ObjectRecord[], profile: ObjectRecord, from: string, to: string): string[] {
  const enabled: string[] | undefined = profile.sources;
  return signals
    .filter((s) => day(s) >= from && day(s) <= to && (!enabled || enabled.includes(s.sourceType)) && profileMatch(profile as never, signalText(s)).hits.length)
    .sort((a, b) => cmp(a.collectedAt, b.collectedAt) || cmp(a.id, b.id))
    .map((s) => s.id);
}

export interface ExpectedItem { id: string; title: string; url?: string; date: string; sourceType: string }
export interface PilotSourceRow { sourceType: string; reached: boolean; expected: number; found: number; missed: number; caught: number; irrelevant: number }
export interface PilotMetrics {
  pilotId: string;
  criteria: { access: number; officialMisses: number; noise: number };
  access: { reached: number; total: number; rate: number };
  expected: number;
  found: number;
  missed: ExpectedItem[];
  missRate: number;
  officialMisses: number; // missed items from the Assembly or government: every source type but news
  caught: number;
  judged: number;
  irrelevant: number;
  unreviewed: number;
  noiseRate: number; // irrelevant / judged; a caught item matched to an expected item counts as relevant unless marked otherwise
  lagMedianDays: number | null;
  matches: { expectedId: string; signalId: string; lagDays: number }[];
  relevance: Record<string, 'relevant' | 'irrelevant' | undefined>; // the call in force for each caught item
  checks: { access: boolean; misses: boolean; noise: boolean };
  pass: boolean;
  bySource: PilotSourceRow[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Pure scoring. signals: every collected item the caller can see; sources: the source types the trial covers;
 * reach: the collector's own fetch result per source type, when known (a live run), which then decides "reached".
 */
export function scorePilot(pilot: ObjectRecord, signals: ObjectRecord[], sources: readonly string[], reach?: Record<string, boolean>): PilotMetrics {
  const byId = new Map(signals.map((s) => [s.id, s]));
  const caught: { signalId: string; relevance?: 'relevant' | 'irrelevant' }[] = pilot.caught;
  const expected: ExpectedItem[] = pilot.expected;

  // Each expected item takes the first unused caught item with the same url, or failing that the same title.
  const free = caught.map((c) => byId.get(c.signalId)).filter((s): s is ObjectRecord => !!s);
  const matches: PilotMetrics['matches'] = [];
  const missed: ExpectedItem[] = [];
  for (const e of expected) {
    const s = free.find((x) => (e.url && x.url === e.url) || norm(x.title) === norm(e.title));
    if (!s) { missed.push(e); continue; }
    free.splice(free.indexOf(s), 1);
    matches.push({ expectedId: e.id, signalId: s.id, lagDays: Math.max(0, daysBetween(e.date, day(s))) });
  }
  const matched = new Set(matches.map((m) => m.signalId));
  const relevance: PilotMetrics['relevance'] = Object.fromEntries(caught.map((c) => [c.signalId, c.relevance ?? (matched.has(c.signalId) ? 'relevant' : undefined)]));
  const calls = Object.values(relevance);
  const judged = calls.filter(Boolean).length;
  const irrelevant = calls.filter((r) => r === 'irrelevant').length;
  const officialMisses = missed.filter((e) => e.sourceType !== 'news').length;

  const inWindow = signals.filter((s) => day(s) >= pilot.from && day(s) <= pilot.to);
  const rank = (t: string) => (SOURCE_TYPES as readonly string[]).indexOf(t);
  const types = [...new Set([...sources, ...expected.map((e) => e.sourceType)])].sort((a, b) => rank(a) - rank(b));
  const typeOf = (id: string) => byId.get(id)?.sourceType;
  const expType = new Map(expected.map((e) => [e.id, e.sourceType]));
  const bySource: PilotSourceRow[] = types.map((t) => ({
    sourceType: t,
    // Without a fetch result: the collector brought back at least one item from this source in the window.
    reached: reach?.[t] ?? inWindow.some((s) => s.sourceType === t),
    expected: expected.filter((e) => e.sourceType === t).length,
    found: matches.filter((m) => expType.get(m.expectedId) === t).length,
    missed: missed.filter((e) => e.sourceType === t).length,
    caught: caught.filter((c) => typeOf(c.signalId) === t).length,
    irrelevant: caught.filter((c) => typeOf(c.signalId) === t && relevance[c.signalId] === 'irrelevant').length,
  }));
  const covered = bySource.filter((r) => sources.includes(r.sourceType));
  const reached = covered.filter((r) => r.reached).length;
  const access = { reached, total: covered.length, rate: covered.length ? round(reached / covered.length, 3) : 1 };
  const noiseRate = judged ? round(irrelevant / judged, 3) : 0;
  const criteria = pilot.criteria;
  const checks = { access: access.rate >= criteria.access, misses: officialMisses <= criteria.officialMisses, noise: noiseRate <= criteria.noise };
  return {
    pilotId: pilot.id, criteria, access, expected: expected.length, found: matches.length, missed, missRate: expected.length ? round(missed.length / expected.length, 3) : 0,
    officialMisses, caught: caught.length, judged, irrelevant, unreviewed: caught.length - judged, noiseRate,
    lagMedianDays: median(matches.map((m) => m.lagDays)), matches, relevance, checks, pass: checks.access && checks.misses && checks.noise, bySource,
  };
}

export function pilotMetrics(view: View, pilotId: string, reach?: Record<string, boolean>): PilotMetrics {
  const pilot = need(view, pilotId);
  return scorePilot(pilot, view.list('Signal'), monitoringProfile(view, pilot.clientId)?.sources ?? SOURCE_TYPES, reach);
}

export const functions = { whatChanged, billRiskScore, responseLevel, keyPeople, upcomingDeadlines, issueExposure, stageGates, stakeholderNetwork, profileMatch, pilotMetrics };
