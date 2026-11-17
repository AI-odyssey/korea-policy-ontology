// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Offline rule-based weekly agent. It reads through its own client-scoped view, calls ontology
// functions, writes only through actions (so every step is audited), and stops at approval gates.
import type { ObjectRecord, Store, View } from '../ontology/runtime.ts';
import type { Ctx, GateConfig } from '../ontology/markings.ts';
import { ProviderGateError, defaultGate } from '../ontology/markings.ts';
import { REVIEW_THRESHOLD } from '../ontology/schema.ts';
import { clientBills, cmp, confirmedView, issueExposure, responseFacts, responseLevel, stageGates, upcomingDeadlines, whatChanged } from '../ontology/functions.ts';
import type { Decider, StageGate } from '../ontology/functions.ts';
import { addDays, monthDay } from '../ontology/dates.ts';
import { disabledLlm, guardedComplete, LlmDisabledError } from './llm.ts';
import type { LlmAdapter } from './llm.ts';
import { proposeTriage, triageParams } from './triage.ts';
import type { TriageProposal } from './triage.ts';
import { billName, countWord, forumOf, sourceFor, weeklyBrief } from './brief.ts';
import type { Brief } from './brief.ts';

export interface TraceStep {
  n: number;
  kind: 'tool' | 'action' | 'gate' | 'note';
  name: string; // the function or action called
  input: string;
  output: string; // written for the engagement lead
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

// ---- Decision rule ----
// A decision goes to the engagement lead for a followed bill at response level act_now, and it names one person to
// persuade: among those who control the agenda of the bill's next meeting (stageGates), someone the client rates as
// high influence whose stance is opposed or not yet known. Anyone an open plan step already targets is skipped.
export const DECISION_RULE = "For each followed bill at response level act_now, take the people who control the agenda of its next meeting and pick one the client rates high influence whose stance is opposed or unconfirmed, unless an open plan step already covers that person.";

export interface DecisionCandidate {
  bill: ObjectRecord;
  meeting: ObjectRecord;
  daysToMeeting: number;
  change?: { from: string | undefined; to: string; date: string };
  position: ObjectRecord;
  gate: StageGate;
  target: { decider: Decider; assessment: ObjectRecord };
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
    const gate = stageGates(view, bill.id).find((g) => g.institutionId === f.slot!.institutionId);
    if (!gate) continue;
    const issues = view.targets(bill.id, 'about').map((i) => i.id);
    const target = gate.deciders
      .map((decider) => ({ decider, assessment: view.list('StakeholderAssessment', (a) => a.clientId === clientId && a.subjectId === decider.id && issues.includes(a.issueId))[0] }))
      .filter(({ decider, assessment: a }) => a && a.influence === 'high' && ['opposed', 'unconfirmed'].includes(a.stance) && !covered.has(decider.id))
      .sort((x, y) => Number(x.assessment.stance !== 'opposed') - Number(y.assessment.stance !== 'opposed'))[0]; // deciders arrive chair first
    if (!target) continue;
    out.push({ bill, meeting: f.slot!, daysToMeeting: f.daysToSlot!, ...(f.change ? { change: f.change } : {}), position: f.position!, gate, target });
  }
  return out;
}

/** "chair of the Health and Welfare Committee's bill review subcommittee", "a secretary of the Public Administration and Security Committee". */
function roleText(view: View, gate: StageGate, d: Decider): string {
  const inst = view.get(gate.institutionId!)!;
  const body = inst.kind === 'subcommittee' ? `the ${view.get(inst.parentId)!.name}'s ${inst.name.startsWith('Bill Review') ? 'bill review ' : ''}subcommittee` : `the ${inst.name}`;
  return d.role === 'chair' ? `chair of ${body}` : `a secretary of ${body}`;
}

export function decisionParams(view: View, clientId: string, c: DecisionCandidate, sourceId: string) {
  const client = view.get(clientId)!;
  const { decider: d, assessment: a } = c.target;
  const forum = forumOf(view, c.meeting);
  const agenda = d.role === 'chair' ? `sets the ${forum} agenda` : `agrees the ${forum} agenda with the chair`;
  const sub = view.get(c.gate.institutionId!)?.kind === 'subcommittee';
  const view_ = a.stance === 'opposed' ? 'is on record against the bill' : 'has not taken a public position on the bill';
  return {
    clientId,
    question: `Meet ${d.name}, ${roleText(view, c.gate, d)}, before ${sub ? 'it' : `the ${forum}`} takes up the ${lower1(billName(c.bill))}?`,
    recommendation: `Yes. ${d.name} ${agenda} and ${view_}. ${c.position.rationale}`,
    alternatives: [
      `Send ${possessive(client.name)} proposed wording to ${possessive(d.name)} office instead of meeting`,
      c.position.stance === 'oppose' ? 'Stop opposing and prepare to comply if the bill passes' : 'Accept the bill as it stands and stop pressing for changes',
    ],
    raisedById: sourceId,
    subjectId: c.bill.id,
    dueDate: [addDays(c.meeting.date, -1), view.baseDate].sort()[1],
  };
}

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
  const inbox = view.list('Signal', (s) => s.status === 'new').sort((a, b) => cmp(a.collectedAt, b.collectedAt) || cmp(a.id, b.id));
  step('tool', 'query.signals', "status = 'new'", `${plural(inbox.length, 'new item')} since the last report.`);
  run.proposals = inbox.map((s) => proposeTriage(view, s, clientId));
  const mine = run.proposals.filter((p) => p.action === 'link' && p.relevantToClient);
  const clear = mine.filter((p) => p.confidence >= REVIEW_THRESHOLD);
  const noise = run.proposals.filter((p) => p.action === 'dismiss');
  const unsure = mine.length - clear.length;
  const sorting = [
    mine.length ? `${cap(plural(mine.length, 'item'))} concern ${client.name}: ${unsure ? `${plural(clear.length, 'clear match', 'clear matches')} and ${countWord(unsure).toLowerCase()} to confirm` : 'all clear matches'}.` : `Nothing new concerns ${client.name}.`,
    noise.length ? `${cap(plural(noise.length, 'item'))} look unrelated to any tracked issue.` : '',
  ];
  step('tool', 'proposeTriage', `${inbox.length} items`, sorting.filter(Boolean).join(' '));

  if (opts.applyTriage) {
    for (const p of [...clear, ...noise]) {
      store.applyAction(ctx, 'triageSignal', triageParams(p));
      run.appliedTriage.push(p.signalId);
    }
    const did = [clear.length ? `filed ${plural(clear.length, 'clear match', 'clear matches')}` : '', noise.length ? `set aside ${plural(noise.length, 'unrelated item')}` : ''].filter(Boolean);
    step('action', 'triageSignal', `${clear.length + noise.length} proposals`,
      `${did.length ? cap(did.join(' and ')) : 'Filed nothing'}.${unsure ? ` ${cap(plural(unsure, 'item'))} ${unsure === 1 ? 'waits' : 'wait'} for you to confirm.` : ''}`);
  } else {
    step('note', 'triageSignal', 'applyTriage is off', `Filed nothing. ${cap(plural(mine.length + noise.length, 'item'))} wait for you.`);
  }

  // 2. What changed
  const changed = whatChanged(view, since);
  const bills = clientBills(view, clientId);
  const mineBills = new Set(bills.map((b) => b.id));
  const moved = changed.stageChanges.filter((c) => mineBills.has(c.billId));
  step('tool', 'whatChanged', `since ${since}`,
    `${cap(plural(moved.length, 'stage change'))} on bills that affect ${client.name}. Across the Assembly, ${plural(changed.eventsHeld.length, 'meeting')} held and ${countWord(changed.eventsUpcoming.length).toLowerCase()} in the next seven days.`);
  const brief0 = weeklyBrief(view, clientId, { since });
  step('tool', 'responseLevel', `${brief0.bills.length} followed bills`,
    `Most pressing: ${brief0.bills.slice(0, 3).map((r) => `${billName(r.bill)} (${r.level.replace('_', ' ')})`).join('; ') || 'none'}.`);

  // 3. Decisions
  const candidates = decisionCandidates(view, clientId, since);
  step('tool', 'stageGates', DECISION_RULE,
    candidates.map((c) => `${billName(c.bill)}: the ${forumOf(view, c.meeting)} meets on ${monthDay(c.meeting.date)}. ${c.target.decider.name} (${c.target.decider.role}, high influence) is ${c.target.assessment.stance === 'opposed' ? 'opposed' : 'unconfirmed'}.`).join(' ')
      || 'No followed bill at act now has an agenda-setter left to persuade.');
  for (const c of candidates) {
    const earlier = view.list('Decision', (d) => d.subjectId === c.bill.id && (d.status === 'open' || String(d.openedAt).slice(0, 10) > since))[0];
    if (earlier) {
      run.decisionId ??= earlier.status === 'open' ? earlier.id : undefined;
      step('note', 'raiseDecision', c.bill.id, `A decision on the ${lower1(billName(c.bill))} is already on record this week. No new one raised.`);
      continue;
    }
    const src = sourceFor(view, c.bill.id);
    if (!src) {
      step('note', 'raiseDecision', c.bill.id, `No source document names the ${lower1(billName(c.bill))}. No decision raised.`);
      continue;
    }
    const params = decisionParams(view, clientId, c, src);
    const res = store.applyAction(ctx, 'raiseDecision', params);
    run.decisionId ??= res.created[0];
    step('action', 'raiseDecision', `${c.bill.id}; target ${c.target.decider.id}; source ${src}`, `Raised: ${params.question}`);
  }

  // 4. Risks the client has not recorded: a followed bill they want changed, on an agenda within seven days.
  const pendingSubjects = new Set(store.pendingApprovals(ctx).filter((p) => p.action === 'addRiskOpportunity').flatMap((p) => p.params.subjectIds as string[]));
  for (const r of brief0.bills) {
    const f = r.facts;
    if (!f.slot || f.daysToSlot! > 7 || !f.position || !['amend', 'oppose'].includes(f.position.stance)) continue;
    if (view.list('RiskOpportunity', (x) => x.clientId === clientId && (x.subjectIds as string[]).includes(r.bill.id)).length || pendingSubjects.has(r.bill.id)) continue;
    const forum = forumOf(view, f.slot);
    const res = store.applyAction(ctx, 'addRiskOpportunity', {
      clientId, kind: 'risk', title: `${billName(r.bill)} at the ${forum}`,
      summary: `The ${lower1(billName(r.bill))} is on the ${forum} agenda${forum.startsWith('Legislation') ? ', after which only the plenary vote remains' : ''}. ${f.position.rationale}`,
      impact: f.impact === 'high' ? 'high' : 'medium', urgency: 'imminent', subjectIds: [r.bill.id],
    });
    if (res.pendingId) run.riskRequests.push(res.pendingId);
    step('action', 'addRiskOpportunity', r.bill.id, `Proposed a risk: ${billName(r.bill)} at the ${forum}. It waits for your approval.`);
  }

  const deadlines = upcomingDeadlines(view, clientId, 30);
  step('tool', 'upcomingDeadlines', '30 days', `${cap(plural(deadlines.length, 'dated item'))} in the next 30 days${deadlines[0] ? `; first: ${deadlines[0].title} (${monthDay(deadlines[0].date)})` : ''}.`);
  const exposure = issueExposure(view, clientId);
  step('tool', 'issueExposure', clientId, `Issues with the most at stake: ${exposure.slice(0, 3).map((e) => e.title).join('; ')}.`);

  // 5. Optional model help. The gate runs before the adapter; a block falls back to the template.
  const llm = opts.llm ?? disabledLlm;
  let narrative: string | undefined;
  try {
    narrative = await guardedComplete(llm, { instruction: 'Write two sentences summarizing the week for the client.', objects: [client, ...bills.slice(0, 3)] }, opts.gate ?? defaultGate);
    step('tool', 'llm.complete', llm.provider, `The approved model wrote a ${narrative.length}-character summary.`);
  } catch (e) {
    if (e instanceof LlmDisabledError) step('note', 'llm.complete', llm.provider, 'No language model is used. The report is built from the template.');
    else if (e instanceof ProviderGateError) step('gate', 'llm.complete', llm.provider, `Blocked: the model provider is not approved for client data. The report is built from the template.`, true);
    else throw e;
  }

  // 6. Draft the report, send it to review, and stop.
  const title = `Weekly report, week ending ${asOf}`;
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
  if (d && d.status === 'in_review') run.gates.push({ action: 'approveDeliverable', by: 'principal', objectId: d.id, reason: 'Only the engagement lead approves; sending stays blocked until then.' });
  if (run.decisionId && view.get(run.decisionId)?.status === 'open') run.gates.push({ action: 'resolveDecision', by: 'principal', objectId: run.decisionId, reason: 'Judgment calls belong to the engagement lead.' });
  for (const id of run.riskRequests) run.gates.push({ action: 'addRiskOpportunity', by: 'principal', objectId: id, reason: 'New risks shown to the client need approval.' });
  step('gate', 'stop', run.gates.map((g) => `${g.action}(${g.objectId})`).join(', ') || 'nothing pending',
    run.gates.length ? `Stopped. ${cap(plural(run.gates.length, 'item'))} wait for your approval; the assistant cannot approve or send.` : 'Stopped. Nothing waits for approval.');
  return run;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SOURCE_LABEL: Record<string, string> = { bill_update: 'Bill tracker', press_release: 'Press release', public_notice: 'Notice', news: 'News', minutes: 'Minutes', seminar: 'Seminar', ministry_press: 'Ministry press release', gazette: 'Official Gazette' };

/** The weekly report: the This week page in memo form, minus open decisions and the team's own tasks. Footnotes cite source documents. */
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
  const L: string[] = [`# ${title.replace(/\d{4}-\d{2}-\d{2}/, (d) => monthDay(d))}: ${client.name}`, '', `**${b.headline}.** ${b.lead}${b.bills[0] ? cite(sourceFor(view, b.bills[0].bill.id)) : ''}`, ''];
  if (narrative) L.push(narrative, '');

  const taken = view.list('Decision', (d) => d.clientId === clientId && d.status === 'resolved' && String(d.openedAt).slice(0, 10) > b.since);
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
  for (const t of b.timeline.slice(0, 8)) L.push(`- ${monthDay(t.date)}: ${t.title} (${t.who}).${cite(sourceFor(view, t.id))}`);
  if (!b.timeline.length) L.push('- No sitting, notice deadline or hearing on the followed bills falls within the next thirty days.');
  L.push('');

  if (b.moves.length) {
    L.push('## Stakeholder moves', '');
    for (const m of b.moves.slice(0, 5)) L.push(`- ${m.text.startsWith(m.subject.name) ? m.text : `${m.subject.name}: ${m.text}`}${m.issueTitle ? ` (${m.issueTitle})` : ''}${cite(m.sourceId)}`);
    L.push('');
  }
  if (b.asks.length) {
    L.push(`## What we need from ${client.name}`, '');
    for (const t of b.asks) L.push(`- ${t.title}, by ${monthDay(t.dueDate)}.`);
    L.push('');
  }
  L.push('## Sources', '', ...notes.map((n, i) => `[^${i + 1}]: ${n}`));
  return { body: L.join('\n'), sources };
}
