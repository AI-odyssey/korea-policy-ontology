// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Offline rule-based weekly agent. It reads through its own client-scoped view, calls ontology
// functions, writes only through actions (so every step is audited), and stops at approval gates.
import type { ObjectRecord, Store, View } from '../ontology/runtime.ts';
import type { Ctx, GateConfig } from '../ontology/markings.ts';
import { ProviderGateError, defaultGate } from '../ontology/markings.ts';
import { REVIEW_THRESHOLD } from '../ontology/schema.ts';
import { clientBills, confirmedView, issueExposure, responseFacts, responseLevel, signalQueue, stageGates, stepKind, upcomingDeadlines, whatChanged, cmp, impactOf } from '../ontology/functions.ts';
import type { Decider, StageGate, StepKind } from '../ontology/functions.ts';
import { addDays, monthDay, nextWorkday, workdaysBefore } from '../ontology/dates.ts';
import { disabledLlm, guardedComplete, LlmDisabledError } from './llm.ts';
import type { LlmAdapter } from './llm.ts';
import { proposeTriage, triageParams } from './triage.ts';
import type { TriageProposal } from './triage.ts';
import { billName, countWord, forumOf, sourceFor, subcommitteeName, TIMELINE_DAYS, weeklyBrief } from './brief.ts';
import type { Brief } from './brief.ts';

export interface TraceStep {
  n: number;
  kind: 'tool' | 'action' | 'gate' | 'note';
  name: string; // the function or action called
  input: string;
  output: string; // written for the head of government affairs
  blocked?: boolean;
}

export interface AgentRun {
  clientId: string;
  since: string;
  asOf: string;
  steps: TraceStep[];
  proposals: TriageProposal[]; // one per new signal, in inbox order
  appliedTriage: string[]; // signal ids the agent filed or set aside itself
  decisionId?: string;
  deliverableId?: string;
  reportMarkdown?: string;
  riskRequests: string[]; // pending approval ids for risks the agent proposed
  gates: { action: string; by: string; objectId: string; reason: string }[];
}

export interface RunOptions {
  clientId: string;
  since?: string; // previous report date; default one week before the base date
  applyTriage?: boolean; // file clear matches for this client (0.8 or above) and set aside noise; the rest wait for a person
  llm?: LlmAdapter;
  gate?: GateConfig;
}

/** An agent only sees public data plus the one client it is assigned to. */
export const agentContext = (clientId: string): Ctx => ({ actor: 'agent-1', role: 'agent', clientIds: [clientId] });

const possessive = (s: string) => (s.endsWith('s') ? `${s}'` : `${s}'s`);
const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`) => `${countWord(n).toLowerCase()} ${n === 1 ? one : many}`;
/** A count at the start of a sentence: "Seven new items", "One item". */
const Plural = (n: number, one: string, many?: string) => cap(plural(n, one, many));
const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ---- Decision rule ----
// A decision goes to company leadership for a followed bill at response level act_now, and it names one person to
// persuade at the bill's next decisive step (a subcommittee review or a full committee vote; a first 상정 is not one).
// Candidates are ranked by what they can do to the text there: the chair of the bill review subcommittee (it writes the
// text), the lead sponsor (a wording change the sponsor accepts is the easiest to carry), then the committee chair (sets the agenda and the vote).
// The other secretary only agrees the agenda and can delay, so is never picked. The client rates the person high influence;
// when the client wants the bill opposed the stance must be opposed or unconfirmed, when it wants amendments any stance
// qualifies, since a supporter can carry the wording. Anyone an open plan step already targets is skipped.
export const DECISION_RULE = "For each followed bill at response level act_now, take the people who can change its text at the next subcommittee review or full committee vote (the subcommittee chair, then the lead sponsor, then the committee chair), and pick the first one the client rates high influence whose stance fits, unless an open plan step already covers that person. The other secretary can only delay and is not picked.";

export type TargetReach = 'subcommittee_chair' | 'lead_sponsor' | 'committee_chair';
export interface DecisionTarget { decider: Decider; assessment: ObjectRecord; reach: TargetReach; bodyId?: string }
const REACH_RANK: Record<TargetReach, number> = { subcommittee_chair: 0, lead_sponsor: 1, committee_chair: 2 };

export interface DecisionCandidate {
  bill: ObjectRecord;
  meeting: ObjectRecord;
  step: StepKind;
  daysToMeeting: number;
  change?: { from: string | undefined; to: string; date: string };
  position: ObjectRecord;
  gate: StageGate;
  target: DecisionTarget;
}

/** People who can change the bill's text at its next decisive meeting, with what each can do. */
function textChangers(view: View, bill: ObjectRecord, gate: StageGate): { decider: Decider; reach: TargetReach; bodyId?: string }[] {
  const out: { decider: Decider; reach: TargetReach; bodyId?: string }[] = [];
  const subGate = gate.key === 'subcommittee' ? gate : stageGates(view, bill.id).find((g) => g.key === 'subcommittee');
  const subChair = subGate?.deciders.find((d) => d.role === 'chair');
  if (subChair) out.push({ decider: subChair, reach: 'subcommittee_chair', bodyId: subGate!.institutionId });
  const sponsor = view.sources(bill.id, 'sponsors').find((p) => p.type === 'Person');
  if (sponsor) out.push({ decider: { id: sponsor.id, name: sponsor.name, role: 'sponsor' }, reach: 'lead_sponsor' });
  const chair = gate.key === 'committee' ? gate.deciders.find((d) => d.role === 'chair') : undefined;
  if (chair) out.push({ decider: chair, reach: 'committee_chair', bodyId: gate.institutionId });
  // One entry per person, keeping the strongest reach (the subcommittee chair who also sponsors the bill is listed as the chair).
  return out.sort((a, b) => REACH_RANK[a.reach] - REACH_RANK[b.reach]).filter((x, i, all) => all.findIndex((y) => y.decider.id === x.decider.id) === i);
}

export function decisionCandidates(view: View, clientId: string, since: string): DecisionCandidate[] {
  view = confirmedView(view);
  const eng = view.list('Engagement', (e) => e.clientId === clientId)[0];
  if (!eng) return [];
  // People an open plan step is already aimed at (a task whose subject is that person).
  const covered = new Set(view.list('Task', (t) => t.clientId === clientId && t.status === 'open' && t.owner !== 'client').map((t) => t.subjectId));
  const out: DecisionCandidate[] = [];
  for (const bill of view.targets(eng.id, 'watches').filter((o) => o.type === 'Bill').sort((a, b) => cmp(a.id, b.id))) {
    if (responseLevel(view, bill.id, clientId, since).level !== 'act_now') continue;
    const f = responseFacts(view, bill.id, clientId, since);
    if (!f.decisive || !f.position) continue; // act now because a notice period closes: there is no meeting to attend
    const gate = stageGates(view, bill.id).find((g) => g.institutionId === f.decisive!.institutionId);
    if (!gate) continue;
    const issues = view.targets(bill.id, 'about').map((i) => i.id);
    const opposing = f.position.stance === 'oppose';
    const target = textChangers(view, bill, gate)
      .map(({ decider, reach, bodyId }) => ({ decider, reach, bodyId, assessment: view.list('StakeholderAssessment', (a) => a.clientId === clientId && a.subjectId === decider.id && issues.includes(a.issueId))[0] }))
      .filter(({ decider, assessment: a }) => a && a.influence === 'high' && (!opposing || ['opposed', 'unconfirmed'].includes(a.stance)) && !covered.has(decider.id))
      .sort((x, y) => REACH_RANK[x.reach] - REACH_RANK[y.reach] || Number(x.assessment.stance !== 'opposed') - Number(y.assessment.stance !== 'opposed'))[0];
    if (!target) continue;
    out.push({ bill, meeting: f.decisive, step: stepKind(view, f.decisive, bill), daysToMeeting: f.daysToDecisive!, ...(f.change ? { change: f.change } : {}), position: f.position, gate, target });
  }
  return out;
}

/** "chair of the Health and Welfare Committee's bill review subcommittee", "the lead sponsor", "chair of the Public Administration and Security Committee". */
function roleText(view: View, c: DecisionCandidate): string {
  const { reach, bodyId } = c.target;
  if (reach === 'lead_sponsor') return 'the lead sponsor';
  const body = view.get(bodyId!)!;
  if (reach === 'committee_chair') return `chair of the ${body.name}`;
  return `chair of the ${view.get(body.parentId)!.name}'s ${subcommitteeName(view, body.id)}`;
}

/** What the person can do to the text, in the words of the recommendation. */
function reachText(c: DecisionCandidate, forum: string, sponsor: boolean): string {
  switch (c.target.reach) {
    case 'subcommittee_chair': return `${c.gate.key === 'subcommittee' ? 'chairs the subcommittee that writes the text' : 'chaired the subcommittee that wrote the text'}${sponsor ? ' and is the lead sponsor' : ''}`;
    case 'lead_sponsor': return 'is the lead sponsor, whose agreement makes a wording change easiest to carry in committee,';
    case 'committee_chair': return `sets the ${forum} agenda`;
  }
}

/**
 * Two working days before the meeting, which leaves a working day to act, but never earlier than the working day after the as-of
 * date. When the meeting is too close for that, the decision is due on the as-of date itself ("Due today").
 */
export function dueDateFor(asOf: string, meetingDate: string): string {
  const due = [workdaysBefore(meetingDate, 2), nextWorkday(asOf)].sort()[1];
  return due < meetingDate ? due : asOf;
}

export function decisionParams(view: View, clientId: string, c: DecisionCandidate, sourceId: string) {
  const client = view.get(clientId)!;
  const { decider: d, assessment: a } = c.target;
  const forum = forumOf(view, c.meeting);
  const takes = c.step === 'vote' ? 'votes on' : 'reviews';
  const lean: Record<string, string> = {
    opposed: `is on record against ${client.name}'s position`, supportive: 'supports the bill', neutral: 'has not taken a side', unconfirmed: 'has not taken a public position on the bill',
  };
  const subChair = c.target.reach === 'subcommittee_chair' && c.gate.key === 'subcommittee';
  const amend = c.position.stance === 'amend';
  return {
    clientId,
    question: `Meet ${d.name}, ${roleText(view, c)}, before ${subChair ? 'it' : `the ${forum}`} ${takes} the ${lower1(billName(c.bill))}?`,
    recommendation: `Meet ${d.name} before the ${monthDay(c.meeting.date)} ${forum}. ${d.name} ${reachText(c, forum, view.sources(c.bill.id, 'sponsors').some((p) => p.id === d.id))} and ${lean[a.stance]}. ${c.position.rationale}`,
    alternatives: [
      `Send ${possessive(client.name)} proposed wording to ${possessive(d.name)} office instead of meeting`,
      amend ? 'Accept the bill as it stands and press for the point in a committee supplementary resolution (부대의견) or in the enforcement decree'
        : 'Stop opposing and prepare to comply if the bill passes, and press for a workable rule in the enforcement decree',
    ],
    raisedById: sourceId,
    subjectId: c.bill.id,
    dueDate: dueDateFor(view.baseDate, c.meeting.date),
    followUp: `Meet ${d.name} before the ${monthDay(c.meeting.date)} ${forum}`,
    targetId: d.id,
    premiseStance: a.stance,
    // What the decision rests on, linked and remembered, so a change to any of them shows it is out of date.
    basisIds: [c.meeting.id, a.id, c.position.id, ...view.targets(c.bill.id, 'about').map((i) => impactOf(view, i.id, clientId)?.id).filter((x): x is string => !!x)],
    premise: { meetingId: c.meeting.id, meetingDate: c.meeting.date, positionId: c.position.id, positionStance: c.position.stance, impact: strongestImpact(view, c.bill.id, clientId) },
  };
}

/** The strongest impact rating among a bill's issues for one company. */
const strongestImpact = (view: View, billId: string, clientId: string): string | undefined =>
  view.targets(billId, 'about').map((i) => impactOf(view, i.id, clientId)?.level as string | undefined).filter(Boolean).sort((a, b) => ['high', 'medium', 'low'].indexOf(a!) - ['high', 'medium', 'low'].indexOf(b!))[0];


export async function runWeeklyAgent(store: Store, opts: RunOptions): Promise<AgentRun> {
  const { clientId } = opts;
  const ctx = agentContext(clientId);
  const view = store.as(ctx);
  const asOf = view.baseDate;
  const since = opts.since ?? addDays(asOf, -7);
  const client = view.get(clientId)!;
  const run: AgentRun = { clientId, since, asOf, steps: [], proposals: [], appliedTriage: [], riskRequests: [], gates: [] };
  const step = (kind: TraceStep['kind'], name: string, input: string, output: string, blocked = false) =>
    run.steps.push({ n: run.steps.length + 1, kind, name, input, output, ...(blocked ? { blocked } : {}) });

  // 1. New items
  const inbox = signalQueue(view);
  step('tool', 'query.signals', 'new items this company has not triaged', `${Plural(inbox.length, 'new item')} since the last report.`);
  run.proposals = inbox.map((s) => proposeTriage(view, s, clientId));
  const mine = run.proposals.filter((p) => p.action === 'link' && p.relevantToClient);
  const clear = mine.filter((p) => p.confidence >= REVIEW_THRESHOLD);
  const noise = run.proposals.filter((p) => p.action === 'dismiss');
  const unsure = mine.length - clear.length;
  const sorting = [
    mine.length ? `${Plural(mine.length, 'item')} ${verb(mine.length, 'concerns', 'concern')} ${client.name}: ${unsure ? `${plural(clear.length, 'clear match', 'clear matches')} and ${countWord(unsure).toLowerCase()} to confirm` : mine.length === 1 ? 'a clear match' : 'all clear matches'}.` : `Nothing new concerns ${client.name}.`,
    noise.length ? `${Plural(noise.length, 'item')} ${verb(noise.length, 'looks', 'look')} unrelated to any tracked issue.` : '',
  ];
  step('tool', 'proposeTriage', `${inbox.length} items`, sorting.filter(Boolean).join(' '));

  if (opts.applyTriage) {
    for (const p of [...clear, ...noise]) {
      store.applyAction(ctx, 'triageSignal', triageParams(p, clientId));
      run.appliedTriage.push(p.signalId);
    }
    const did = [clear.length ? `filed ${plural(clear.length, 'clear match', 'clear matches')}` : '', noise.length ? `set aside ${plural(noise.length, 'unrelated item')}` : ''].filter(Boolean);
    step('action', 'triageSignal', `${clear.length + noise.length} proposals`,
      `${did.length ? cap(did.join(' and ')) : 'Filed nothing'}.${unsure ? ` ${Plural(unsure, 'item')} ${verb(unsure, 'waits', 'wait')} for you to confirm.` : ''}`);
  } else {
    step('note', 'triageSignal', 'applyTriage is off', `Filed nothing. ${Plural(mine.length + noise.length, 'item')} ${verb(mine.length + noise.length, 'waits', 'wait')} for you.`);
  }

  // 2. What changed
  const changed = whatChanged(view, since);
  const bills = clientBills(view, clientId);
  const mineBills = new Set(bills.map((b) => b.id));
  const moved = changed.stageChanges.filter((c) => mineBills.has(c.billId));
  step('tool', 'whatChanged', `since ${since}`,
    `${Plural(moved.length, 'stage change')} on bills that affect ${client.name}. Across the Assembly, ${plural(changed.eventsHeld.length, 'meeting')} held and ${countWord(changed.eventsUpcoming.length).toLowerCase()} in the next seven days.`);
  const brief0 = weeklyBrief(view, clientId, { since });
  step('tool', 'responseLevel', `${brief0.bills.length} followed bills`,
    `Most pressing: ${brief0.bills.slice(0, 3).map((r) => `${billName(r.bill)} (${r.level.replace('_', ' ')})`).join('; ') || 'none'}.`);

  // 3. Decisions
  const candidates = decisionCandidates(view, clientId, since);
  step('tool', 'stageGates', DECISION_RULE,
    candidates.map((c) => `${billName(c.bill)}: the ${forumOf(view, c.meeting)} ${c.step === 'vote' ? 'votes' : 'reviews it'} on ${monthDay(c.meeting.date)}. ${c.target.decider.name} (${roleText(view, c)}, high influence) can change the text there and is ${c.target.assessment.stance}.`).join(' ')
      || 'No followed bill at act now has someone left to persuade who can change its text at the next meeting.');
  for (const c of candidates) {
    const earlier = view.list('Decision', (d) => d.subjectId === c.bill.id && (d.status === 'open' || (String(d.openedAt).slice(0, 10) > since && d.resolution !== 'withdraw')))[0];
    if (earlier) {
      run.decisionId ??= earlier.status === 'open' ? earlier.id : undefined;
      step('note', 'raiseDecision', c.bill.id, `A decision on the ${lower1(billName(c.bill))} is already on record this week. No new one raised.`);
      continue;
    }
    const src = sourceFor(view, c.meeting.id) ?? sourceFor(view, c.bill.id);
    if (!src) {
      step('note', 'raiseDecision', c.bill.id, `No source document names the ${lower1(billName(c.bill))}. No decision raised.`);
      continue;
    }
    const params = decisionParams(view, clientId, c, src);
    const res = store.applyAction(ctx, 'raiseDecision', params);
    run.decisionId ??= res.created[0];
    step('action', 'raiseDecision', `${c.bill.id}; target ${c.target.decider.id}; source ${src}`, `Raised: ${params.question}`);
  }

  // 4. Risks the client has not recorded: a followed bill they want changed, with a subcommittee review or full committee vote within seven days (a first 상정 or a wording review does not count).
  const pendingSubjects = new Set(store.pendingApprovals(ctx).filter((p) => p.action === 'addRiskOpportunity').flatMap((p) => p.params.subjectIds as string[]));
  for (const r of brief0.bills) {
    const f = r.facts;
    if (!f.textOpen || !f.decisive || f.daysToDecisive! > 7 || !f.position || !['amend', 'oppose'].includes(f.position.stance)) continue;
    if (view.list('RiskOpportunity', (x) => x.clientId === clientId && (x.subjectIds as string[]).includes(r.bill.id)).length || pendingSubjects.has(r.bill.id)) continue;
    const forum = forumOf(view, f.decisive);
    const res = store.applyAction(ctx, 'addRiskOpportunity', {
      clientId, kind: 'risk', title: `${billName(r.bill)} at the ${forum}`,
      summary: `The ${lower1(billName(r.bill))} is on the ${forum} agenda for ${stepKind(view, f.decisive, r.bill) === 'vote' ? 'a vote' : 'review'}, where its text can still change. ${f.position.rationale}`,
      impact: f.impact === 'high' ? 'high' : 'medium', urgency: 'imminent', subjectIds: [r.bill.id],
    });
    if (res.pendingId) run.riskRequests.push(res.pendingId);
    step('action', 'addRiskOpportunity', r.bill.id, `Proposed a risk: ${billName(r.bill)} at the ${forum}. It waits for your review.`);
  }

  const deadlines = upcomingDeadlines(view, clientId, TIMELINE_DAYS);
  step('tool', 'upcomingDeadlines', `${TIMELINE_DAYS} days`, `${Plural(deadlines.length, 'dated item')} in the next ${TIMELINE_DAYS} days${deadlines[0] ? `; first: ${deadlines[0].title} (${monthDay(deadlines[0].date)})` : ''}.`);
  const exposure = issueExposure(view, clientId);
  step('tool', 'issueExposure', clientId, `Issues ranked by exposure, the risk of the worst open bill plus a little for each other open bill. This ranking ignores the priority numbers in the monitoring profile: ${exposure.slice(0, 3).map((e) => e.title).join('; ')}.`);

  // 5. Optional model help. The gate runs before the adapter; a block falls back to the template.
  const llm = opts.llm ?? disabledLlm;
  let narrative: string | undefined;
  try {
    narrative = await guardedComplete(llm, { instruction: 'Write two sentences summarizing the week for company leadership.', objects: [client, ...bills.slice(0, 3)] }, opts.gate ?? defaultGate);
    step('tool', 'llm.complete', llm.provider, `The approved model wrote a ${narrative.length}-character summary.`);
  } catch (e) {
    if (e instanceof LlmDisabledError) step('note', 'llm.complete', llm.provider, "The summary is written from this week's records, without a language model.");
    else if (e instanceof ProviderGateError) step('gate', 'llm.complete', llm.provider, "Blocked: the model provider is not approved for company data. The summary is written from this week's records instead.", true);
    else throw e;
  }

  // 6. Draft the report, send it to review, and stop.
  const title = reportTitle(asOf);
  const existing = view.list('Deliverable', (d) => d.title === title && d.clientId === clientId)[0];
  if (existing) {
    run.deliverableId = existing.id;
    step('note', 'draftDeliverable', title, `This week's report already exists. Not drafted again.`);
  } else {
    const md = buildReport(view, clientId, weeklyBrief(view, clientId, { since, clientFacing: true }), title, narrative);
    run.reportMarkdown = md.body;
    const res = store.applyAction(ctx, 'draftDeliverable', { clientId, kind: 'weekly_report', title, body: md.body, sourceIds: md.sources });
    run.deliverableId = res.created[0];
    step('action', 'draftDeliverable', title, `Drafted the weekly report from ${plural(md.sources.length, 'source document')}.`);
    store.applyAction(ctx, 'submitForReview', { deliverableId: run.deliverableId });
    step('action', 'submitForReview', run.deliverableId, 'Sent the report to you for review.');
  }

  // 7. Gates
  const d = view.get(run.deliverableId!);
  if (d && d.status === 'in_review') run.gates.push({ action: 'approveDeliverable', by: 'principal', objectId: d.id, reason: 'Only the head of government affairs approves; sending stays blocked until then.' });
  if (run.decisionId && view.get(run.decisionId)?.status === 'open') run.gates.push({ action: 'resolveDecision', by: 'principal', objectId: run.decisionId, reason: 'Business calls belong to company leadership.' });
  for (const id of run.riskRequests) run.gates.push({ action: 'addRiskOpportunity', by: 'principal', objectId: id, reason: 'New risks shown to leadership need review.' });
  step('gate', 'stop', run.gates.map((g) => `${g.action}(${g.objectId})`).join(', ') || 'nothing pending', stopLine(run.gates));
  return run;
}

/** "Stopped. The weekly report and one new risk wait for your review, and one decision waits for leadership." */
export function stopLine(gates: AgentRun['gates']): string {
  const report = gates.some((g) => g.action === 'approveDeliverable');
  const risks = gates.filter((g) => g.action === 'addRiskOpportunity').length;
  const decisions = gates.filter((g) => g.action === 'resolveDecision').length;
  const approvals = [report ? 'the weekly report' : '', risks ? plural(risks, 'new risk') : ''].filter(Boolean);
  const parts = [
    approvals.length ? `${approvals.join(' and ')} ${verb(Number(report) + risks, 'waits', 'wait')} for your review` : '',
    decisions ? `${plural(decisions, 'decision')} ${verb(decisions, 'waits', 'wait')} for leadership` : '',
  ].filter(Boolean);
  if (!parts.length) return 'Stopped. Nothing waits for you.';
  return `Stopped. ${cap(parts.join(', and '))}. The assistant cannot approve or send.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SOURCE_LABEL: Record<string, string> = { bill_update: 'Bill tracker', press_release: 'Press release', public_notice: 'Notice', news: 'News', minutes: 'Minutes', seminar: 'Seminar', ministry_press: 'Ministry press release', gazette: 'Official Gazette' };

/** The weekly report to company leadership: the This week page in memo form, minus open decisions and the GR team's own tasks. Footnotes cite source documents. */
export function buildReport(view: View, clientId: string, b: Brief, title: string, narrative?: string): { body: string; sources: string[] } {
  const client = view.get(clientId)!;
  const notes: string[] = [];
  const sources: string[] = [];
  const cite = (id?: string) => {
    if (!id) return '';
    const s = view.get(id)!;
    if (!sources.includes(id)) {
      sources.push(id);
      notes.push(`[${String(s.title).replace(/[[\]]/g, '')}](obj:${id}) (${SOURCE_LABEL[s.sourceType] ?? 'Record'}, ${monthDay(s.collectedAt)})`);
    }
    return `[^${sources.indexOf(id) + 1}]`;
  };
  // The headline names the top bill's next meeting, so it cites the notice for that meeting.
  const top = b.bills[0];
  const headSource = top ? (top.facts.slot && sourceFor(view, top.facts.slot.id)) || sourceFor(view, top.bill.id) : undefined;
  const L: string[] = [`# ${title.replace(/\d{4}-\d{2}-\d{2}/, (d) => monthDay(d))}: ${client.name}`, '', `For ${client.name} leadership, from the government affairs team.`, '', `**${b.headline}.** ${b.lead}${cite(headSource)}`, ''];
  if (narrative) L.push(narrative, '');

  const taken = view.list('Decision', (d) => d.clientId === clientId && d.status === 'resolved' && d.resolution !== 'withdraw' && String(d.openedAt).slice(0, 10) > b.since);
  if (taken.length) {
    L.push('## Decisions taken', '');
    for (const d of taken) L.push(`- ${d.question.replace(/\?$/, '')}: ${d.resolution === 'approve' ? 'approved' : d.resolution === 'alternative' ? `chose "${d.resolutionNote}"` : 'declined'}.`);
    L.push('');
  }
  const ro = (items: ObjectRecord[], heading: string) => {
    if (!items.length) return;
    L.push(`## ${heading}`, '');
    for (const r of items) L.push(`- **${r.title}** (${r.impact} impact${r.dueDate ? `, by ${monthDay(r.dueDate)}` : ''}). ${r.summary}${cite(sourceFor(view, r.id))}`);
    L.push('');
  };
  ro(b.risks, 'Risks');
  ro(b.opportunities, 'Opportunities');

  L.push('## Coming up', '');
  // The same dated list the screen shows, without the team's own work and open decisions.
  for (const t of b.timeline) L.push(`- ${monthDay(t.date)}: ${t.title} (${t.who}).${cite(sourceFor(view, t.id))}`);
  if (!b.timeline.length) L.push('- No sitting, notice deadline or hearing on the followed bills falls within the next thirty days.');
  L.push('');

  if (b.moves.length) {
    L.push('## Stakeholder moves', '');
    for (const m of b.moves.slice(0, 5)) L.push(`- ${m.text.includes(m.subject.name) ? m.text : `${m.subject.name}: ${m.text}`} (${[m.at, m.issueTitle].filter(Boolean).join('; ')})${cite(m.sourceId)}`);
    L.push('');
  }
  if (b.asks.length) {
    L.push('## What we need from other teams', '');
    for (const t of b.asks) L.push(`- ${t.title}, by ${monthDay(t.dueDate)}.`);
    L.push('');
  }
  L.push('## Sources', '', ...notes.map((n, i) => `[^${i + 1}]: ${n}`));
  return { body: L.join('\n'), sources };
}

// ---- Keeping the report and decisions current after the run ----

/** The weekly report title for a base date. */
export const reportTitle = (asOf: string) => `Weekly report, week ending ${asOf}`;

/**
 * Rebuilds this week's report from current data and replaces its text when anything changed (an approved risk, a decision
 * taken). An approved report that changes goes back to review, so a stale report can never be sent. Returns true on a change.
 */
export function refreshWeeklyReport(store: Store, ctx: Ctx, clientId: string, since?: string): boolean {
  const view = store.as(ctx);
  const title = reportTitle(view.baseDate);
  const d = view.list('Deliverable', (x) => x.clientId === clientId && x.title === title && ['draft', 'in_review', 'approved'].includes(x.status))[0];
  if (!d) return false;
  const md = buildReport(view, clientId, weeklyBrief(view, clientId, { since: since ?? addDays(view.baseDate, -7), clientFacing: true }), title);
  if (md.body === d.body) return false;
  store.applyAction(ctx, 'redraftDeliverable', { deliverableId: d.id, body: md.body, sourceIds: md.sources });
  return true;
}

/** Why an open decision no longer holds, if it does not: the stance it rests on has changed. */
export function decisionStale(view: View, d: ObjectRecord): string | undefined {
  if (d.status !== 'open') return undefined;
  if (d.targetId && d.premiseStance) {
    const issues = new Set(view.targets(d.subjectId, 'about').map((i) => i.id));
    const now = view.list('StakeholderAssessment', (a) => a.clientId === d.clientId && a.subjectId === d.targetId && issues.has(a.issueId))[0];
    if (now && now.stance !== d.premiseStance) return 'stance changed';
  }
  const p = d.premise as { meetingId?: string; meetingDate?: string; positionId?: string; positionStance?: string; impact?: string } | undefined;
  if (!p) return undefined;
  const meeting = p.meetingId ? view.get(p.meetingId) : undefined;
  if (meeting && (meeting.date !== p.meetingDate || meeting.status === 'cancelled')) return 'meeting moved';
  const pos = p.positionId ? view.get(p.positionId) : undefined;
  if (pos && pos.stance !== p.positionStance) return 'company position changed';
  if (p.impact && d.subjectId && strongestImpact(view, d.subjectId, d.clientId) !== p.impact) return 'impact rating changed';
  return undefined;
}

/**
 * Withdraws an out-of-date decision and raises a fresh one for the same bill if the decision rule still finds someone to
 * persuade. Returns the new decision id, or undefined when nothing needs deciding any more.
 */
export function regenerateDecision(store: Store, ctx: Ctx, decisionId: string): string | undefined {
  const view = store.as(ctx);
  const d = view.get(decisionId)!;
  store.applyAction(ctx, 'resolveDecision', { decisionId, resolution: 'withdraw', note: `Out of date: ${decisionStale(view, d) ?? 'premise changed'}` });
  const fresh = store.as(ctx);
  const c = decisionCandidates(fresh, d.clientId, addDays(fresh.baseDate, -7)).find((x) => x.bill.id === d.subjectId);
  if (!c) return undefined;
  const src = sourceFor(fresh, c.meeting.id) ?? sourceFor(fresh, c.bill.id);
  if (!src) return undefined;
  return store.applyAction(ctx, 'raiseDecision', decisionParams(fresh, d.clientId, c, src)).created[0];
}
