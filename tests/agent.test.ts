// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { describe, expect, it } from 'vitest';
import { agentContext, decisionCandidates, openWeek, runWeeklyAgent, weeklyBrief } from '../agent/index.ts';
import { responseLevel, stageGates } from '../ontology/functions.ts';
import type { LlmAdapter } from '../agent/index.ts';
import { CLIENTS, codeOf, ctx, freshStore, principal } from './helpers.ts';

const lead = (c: string) => ctx('principal', [c], 'principal-1');

describe('weekly agent (offline)', () => {
  it('files clear matches, raises the Aster decision, proposes a risk, drafts a report, and stops at the gate', async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const v = s.as(principal);

    expect(run.steps.map((x) => x.n)).toEqual(run.steps.map((_, i) => i + 1));
    expect(run.steps.at(-1)!.kind).toBe('gate');
    expect(run.appliedTriage.length).toBeGreaterThan(0);
    expect(run.since).toBe('2026-11-09'); // base date minus 7 days

    const decision = v.get(run.decisionId!)!;
    expect(decision).toMatchObject({ status: 'open', subjectId: 'bill-001', clientId: 'cli-aster', dueDate: '2026-11-17' }); // two working days before the full committee, so one is left to act
    expect(decision.question).toBe('Meet Baek Siwoo, the lead sponsor, before the full committee votes on the sidewalk robot duties bill?');
    expect(decision.recommendation).toMatch(/^Meet Baek Siwoo before the Nov 19 full committee\. Baek Siwoo is the lead sponsor, whose agreement makes a wording change easiest to carry in committee, and supports the bill\. Aster Robotics /);
    expect(decision.alternatives).toEqual(["Send Aster Robotics' proposed wording to Baek Siwoo's office instead of meeting", 'Accept the bill as it stands and press for the point in a committee supplementary resolution (부대의견) or in the enforcement decree']);
    const [source] = v.targets(decision.id, 'raised_by');
    expect(source).toMatchObject({ type: 'Signal' });
    expect(source.rawText).toContain('22-S0308');
    expect(run.steps.find((x) => x.name === 'llm.complete')).toMatchObject({ kind: 'note', output: "The summary is written from this week's records, without a language model." });

    const d = v.get(run.deliverableId!)!;
    expect(d.status).toBe('in_review'); // the agent never approves or sends
    expect(run.gates.map((g) => g.action)).toEqual(['approveDeliverable', 'resolveDecision', 'addRiskOpportunity']);
    // The coverage ask belongs where the text is still open: the weight-class bill in subcommittee, not the Legislation and Judiciary Committee.
    const [risk] = s.pendingApprovals(lead('cli-aster')).filter((p) => p.action === 'addRiskOpportunity');
    expect(risk.params).toMatchObject({ kind: 'risk', subjectIds: ['bill-008'], urgency: 'imminent' });
    expect(risk.params.summary).toMatch(/where its text can still change/);
    expect(JSON.stringify(risk.params)).not.toMatch(/Legislation and Judiciary/);
    const agentWrites = s.auditEntries(principal).filter((a) => a.role === 'agent' && a.status === 'executed').map((a) => a.action);
    expect(new Set(agentWrites)).toEqual(new Set(['triageSignal', 'raiseDecision', 'draftDeliverable', 'submitForReview']));

    // The head of government affairs finishes the loop; the agent cannot.
    expect(codeOf(() => s.applyAction(agentContext('cli-aster'), 'approveDeliverable', { deliverableId: d.id }))).toBe('PERMISSION_DENIED');
    s.applyAction(principal, 'approveDeliverable', { deliverableId: d.id });
    s.applyAction(principal, 'resolveDecision', { decisionId: decision.id, resolution: 'approve' });
    // The follow-up is due before the meeting it prepares for, not three days out, and never on a weekend.
    const [followUp] = v.list('Task', (t) => t.subjectId === decision.id);
    expect(followUp.dueDate).toBe('2026-11-17');
    expect(followUp.dueDate < '2026-11-19').toBe(true);
  });

  it('is idempotent: a second run adds no duplicate decision, risk proposal or report', async () => {
    const s = freshStore();
    await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const second = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const v = s.as(principal);
    expect(v.list('Decision', (d) => d.subjectId === 'bill-001')).toHaveLength(1);
    expect(v.list('Deliverable', (d) => d.title.includes('2026-11-16'))).toHaveLength(1);
    expect(s.pendingApprovals(lead('cli-aster')).filter((p) => p.action === 'addRiskOpportunity')).toHaveLength(1);
    expect(second.steps.some((x) => x.kind === 'note' && /already/.test(x.output))).toBe(true);
  });

  it('does not raise the same decision again after the lead has resolved it this week', async () => {
    const s = freshStore();
    const first = await runWeeklyAgent(s, { clientId: 'cli-aster' });
    s.applyAction(principal, 'resolveDecision', { decisionId: first.decisionId!, resolution: 'reject' });
    await runWeeklyAgent(s, { clientId: 'cli-aster' });
    expect(s.as(principal).list('Decision', (d) => d.subjectId === 'bill-001')).toHaveLength(1);
  });

  it('proposes without applying by default; proposals separate noise, clear and uncertain matches', async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster' });
    expect(run.appliedTriage).toEqual([]);
    expect(s.as(principal).list('Signal', (x) => x.status === 'new')).toHaveLength(run.proposals.length);
    expect(run.steps.find((x) => x.name === 'triageSignal')!.output).toMatch(/^Filed nothing\./);
    expect(run.proposals.some((p) => p.action === 'dismiss')).toBe(true);
    expect(run.proposals.some((p) => p.action === 'link' && p.confidence >= 0.8)).toBe(true);
    expect(run.proposals.some((p) => p.action === 'link' && p.confidence < 0.8)).toBe(true);
    const hero = run.proposals.find((p) => p.billId === 'bill-001');
    expect(hero).toMatchObject({ action: 'link', issueId: 'iss-01' });
    expect(hero!.excerpt.length).toBeGreaterThan(0);
  });

  it("applyTriage files only this client's clear matches and noise; uncertain items stay for a person", async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const applied = run.proposals.filter((p) => run.appliedTriage.includes(p.signalId));
    expect(applied.every((p) => p.action === 'dismiss' || (p.relevantToClient && p.confidence >= 0.8))).toBe(true);
    const left = run.proposals.filter((p) => p.action === 'link' && p.relevantToClient && !run.appliedTriage.includes(p.signalId));
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((p) => p.confidence < 0.8)).toBe(true);
  });

  it('never sees another client: no Moru object or Moru log entry reaches an Aster run', async () => {
    const s = freshStore();
    await runWeeklyAgent(s, { clientId: 'cli-moru', applyTriage: true }); // put Moru activity in the shared log first
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const all = s.as(principal);
    const moruIds = [...new Set(s.snapshot().world.objects.filter((o) => o.markings.includes('CLIENT:cli-moru')).map((o) => o.id))];
    const moruEntries = s.auditEntries(principal).filter((a) => a.markings.includes('CLIENT:cli-moru'));
    expect(moruIds.length).toBeGreaterThan(10);
    expect(moruEntries.length).toBeGreaterThan(0);

    const agent = agentContext('cli-aster');
    const seen = s.as(agent);
    expect(moruIds.filter((id) => seen.get(id))).toEqual([]);
    const asterLog = s.auditEntries(agent);
    expect(asterLog.length).toBeGreaterThan(0);
    expect(asterLog.filter((a) => moruEntries.includes(a))).toEqual([]);
    // Nothing the Aster agent produced names a Moru object: not its trace, its report, or its log entries.
    const produced = JSON.stringify({ steps: run.steps, report: run.reportMarkdown, log: asterLog });
    expect(moruIds.filter((id) => new RegExp(`\\b${id}\\b`).test(produced))).toEqual([]);
    expect(produced).not.toContain(all.get('cli-moru')!.name);
  });
});

describe('decision target', () => {
  it('Aster: the sidewalk bill at act now, the full committee votes on it, and the lead sponsor is picked because he can change the wording', () => {
    const v = freshStore().as(agentContext('cli-aster'));
    const [c, ...rest] = decisionCandidates(v, 'cli-aster', '2026-11-09');
    expect(rest).toEqual([]);
    expect(c.bill.id).toBe('bill-001');
    expect(c.change).toMatchObject({ from: 'subcommittee', to: 'subcommittee_passed', date: '2026-11-12' });
    expect(c.meeting).toMatchObject({ kind: 'full_committee', date: '2026-11-19', institutionId: 'inst-pasc' });
    expect(c.step).toBe('vote');
    expect(c.daysToMeeting).toBe(3);
    expect(c.position).toMatchObject({ id: 'pos-aster-1', stance: 'amend' });
    // After the subcommittee passed the text, those who can change it are its chair, the lead sponsor and the committee chair. The committee
    // chair and the subcommittee chair already have open plan steps, so the sponsor is picked. The other secretary (Jang Sora) can only delay.
    expect(c.gate.deciders.map((d) => d.id)).toEqual(['per-001', 'per-005', 'per-004']);
    expect(c.target.decider).toMatchObject({ id: 'per-002', name: 'Baek Siwoo', role: 'sponsor' });
    expect(c.target.reach).toBe('lead_sponsor');
    expect(c.target.assessment).toMatchObject({ stance: 'supportive', influence: 'high' });
  });

  it('every client: a candidate is a followed act-now bill at a review or a vote, and the target can change its text there with high influence', () => {
    const s = freshStore();
    const targets: Record<string, string[]> = {};
    for (const c of CLIENTS) {
      const v = s.as(agentContext(c));
      const watched = new Set(v.targets(`eng-${c.slice(4)}`, 'watches').map((o) => o.id));
      const found = decisionCandidates(v, c, '2026-11-09');
      for (const x of found) {
        expect(watched.has(x.bill.id)).toBe(true);
        expect(responseLevel(v, x.bill.id, c).level).toBe('act_now');
        expect(['review', 'vote']).toContain(x.step); // a first 상정 is never a decision
        expect(['subcommittee_chair', 'lead_sponsor', 'committee_chair']).toContain(x.target.reach); // a secretary who can only delay is never picked
        expect(stageGates(v, x.bill.id).find((g) => g.institutionId === x.meeting.institutionId)).toBeDefined();
        expect(x.target.assessment.influence).toBe('high');
        if (x.position.stance === 'oppose') expect(['opposed', 'unconfirmed']).toContain(x.target.assessment.stance);
      }
      targets[c] = found.map((x) => x.target.decider.name);
    }
    expect(targets).toEqual({ 'cli-aster': ['Baek Siwoo'], 'cli-moru': ['Shin Hyewon'], 'cli-wren': ['Hong Jiwan'] });
  });

  it('someone who writes the text comes before someone who only sets the agenda', () => {
    const s = freshStore();
    s.applyAction(lead('cli-aster'), 'completeTask', { taskId: 'task-aster-4' }); // the open step aimed at the committee chair
    s.applyAction(lead('cli-aster'), 'completeTask', { taskId: 'task-aster-5' }); // the open step aimed at the subcommittee chair
    // The subcommittee chair (who wrote the text) now outranks the sponsor.
    expect(decisionCandidates(s.as(agentContext('cli-aster')), 'cli-aster', '2026-11-09')[0].target).toMatchObject({ reach: 'subcommittee_chair', decider: { id: 'per-004' } });
    // Moru: the sponsor of the meat terms bill is opposed and the subcommittee chair unconfirmed, but the chair writes the text.
    expect(decisionCandidates(freshStore().as(agentContext('cli-moru')), 'cli-moru', '2026-11-09')[0].target).toMatchObject({ reach: 'subcommittee_chair', decider: { name: 'Shin Hyewon' } });
  });

  it('the other secretary, who can only delay, is never the target', () => {
    const s = freshStore();
    // Cover everyone who can change the text; only the secretary who can delay is left, and she is not offered.
    for (const subjectId of ['per-002']) s.applyAction(lead('cli-aster'), 'createTask', { clientId: 'cli-aster', title: 'Meet', dueDate: '2026-11-18', owner: 'human', subjectId });
    expect(decisionCandidates(s.as(agentContext('cli-aster')), 'cli-aster', '2026-11-09')).toEqual([]); // Jang Sora (per-005) is not offered
  });

  it('skips a person an open plan step already targets, and raises nothing when nobody is left', () => {
    const s = freshStore();
    s.applyAction(lead('cli-aster'), 'createTask', { clientId: 'cli-aster', title: 'Meet Baek Siwoo', dueDate: '2026-11-18', owner: 'human', subjectId: 'per-002' });
    expect(decisionCandidates(s.as(agentContext('cli-aster')), 'cli-aster', '2026-11-09')).toEqual([]);
  });

  it('each act-now condition is required', () => {
    // No stage change in the window: start the week after the 11-12 vote.
    expect(decisionCandidates(freshStore().as(agentContext('cli-aster')), 'cli-aster', '2026-11-12')).toEqual([]);
    // Client supports the bill: nothing to escalate.
    const s = freshStore();
    s.applyAction(principal, 'setClientPosition', { clientId: 'cli-aster', targetId: 'bill-001', stance: 'support', rationale: 'Changed view' });
    expect(decisionCandidates(s.as(agentContext('cli-aster')), 'cli-aster', '2026-11-09')).toEqual([]);
    // A bill the engagement does not follow never qualifies: bill-014 passed the health subcommittee on 11-12 with the lawmaker bills.
    expect(decisionCandidates(freshStore().as(agentContext('cli-moru')), 'cli-moru', '2026-11-09').map((c) => c.bill.id)).toEqual(['bill-018']);
  });
});

describe('weekly report', () => {
  it('follows the This week page: same order, client-facing items only, footnotes to source documents', async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const body = run.reportMarkdown!;
    const v = s.as(lead('cli-aster'));
    const brief = weeklyBrief(v, 'cli-aster', { clientFacing: true });

    expect(body.split('\n')[4]).toBe(`**${brief.headline}.** ${brief.lead}[^1]`);
    const sections = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(sections).toEqual(['Risks', 'Opportunities', 'Coming up', 'Stakeholder moves', 'What we need from other teams', 'Sources']);
    // Risks in response-level order: the act-now bill's risk first.
    const risks = body.slice(body.indexOf('## Risks'), body.indexOf('## Opportunities'));
    expect(risks.indexOf('Stop rule for pedestrians')).toBeLessThan(risks.indexOf('A single certification body'));
    expect(brief.risks.map((r) => r.title)).toEqual(['Stop rule for pedestrians', 'A single certification body']);

    // Nothing internal: no team tasks, no open decisions, no pipeline vocabulary.
    const internal = v.list('Task', (t) => t.clientId === 'cli-aster' && t.owner !== 'client' && t.status === 'open').map((t) => t.title);
    expect(internal.length).toBeGreaterThan(0);
    for (const t of internal) expect(body).not.toContain(t);
    for (const d of v.list('Decision', (x) => x.status === 'open')) expect(body).not.toContain(d.question);
    expect(body).not.toMatch(/\bsignals?\b/i);
    expect(brief.timeline.every((t) => !t.internal)).toBe(true);
    for (const t of v.list('Task', (x) => x.clientId === 'cli-aster' && x.owner === 'client' && x.status === 'open')) expect(body).toContain(t.title);

    // Every footnote is a source document, not a bill.
    const notes = [...body.matchAll(/^\[\^\d+\]: \[[^\]]+\]\(obj:([^)]+)\)/gm)].map((m) => m[1]);
    expect(notes.length).toBeGreaterThan(3);
    expect(notes.every((id) => v.get(id)?.type === 'Signal')).toBe(true);
    expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('is addressed to company leadership and names the team behind each need', async () => {
    const run = await runWeeklyAgent(freshStore(), { clientId: 'cli-aster', applyTriage: true });
    const body = run.reportMarkdown!;
    expect(body).toContain('For Aster Robotics leadership, from the government affairs team.');
    expect(body).toContain('- Cargo model width and stopping-distance data · Engineering, by ');
    expect(body).not.toMatch(/\bclient\b/i);
    expect(body.match(/^- Nov 17: Cargo model width and stopping-distance data \(Engineering\)\./m)).not.toBeNull();
  });
});

describe('opening the week', () => {
  it('leaves a consultant position change and an assistant risk proposal waiting for the Aster lead', async () => {
    const s = freshStore();
    await openWeek(s, CLIENTS);
    const pending = s.pendingApprovals(lead('cli-aster'));
    expect(pending.map((p) => [p.action, p.requesterRole]).sort()).toEqual([['addRiskOpportunity', 'agent'], ['setClientPosition', 'consultant']]);
    expect(s.pendingApprovals(lead('cli-moru'))).toEqual([]);
    expect(s.as(principal).list('Decision', (d) => d.status === 'open').map((d) => d.clientId).sort()).toEqual(['cli-aster', 'cli-moru', 'cli-moru', 'cli-wren']);
  });
});

describe('model adapter in a run', () => {
  it('an exact bill number match clears the review line on its own', async () => {
    const run = await runWeeklyAgent(freshStore(), { clientId: 'cli-aster' });
    const exact = run.proposals.filter((p) => p.matched.some((m) => /^22-S\d{4}$/.test(m)));
    expect(exact.length).toBeGreaterThan(0);
    expect(exact.every((p) => p.confidence >= 0.9)).toBe(true);
  });

  it('an enabled but unapproved LLM provider is blocked by the gate and the run still completes', async () => {
    const s = freshStore();
    let called = false;
    const llm: LlmAdapter = { provider: 'unlisted-model', enabled: true, complete: async () => ((called = true), 'x') };
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', llm });
    expect(called).toBe(false);
    expect(run.steps.find((x) => x.name === 'llm.complete')).toMatchObject({ kind: 'gate', blocked: true });
    expect(run.deliverableId).toBeDefined();
  });

  it('an approved provider is used', async () => {
    const s = freshStore();
    const llm: LlmAdapter = { provider: 'approved-private', enabled: true, complete: async () => 'Narrative from the model.' };
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', llm, gate: { approvedClientDataProviders: ['approved-private'] } });
    expect(run.reportMarkdown).toContain('Narrative from the model.');
  });
});
