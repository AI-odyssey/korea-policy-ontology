// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { describe, expect, it } from 'vitest';
import { asterConsultant, codeOf, ctx, freshStore, principal } from './helpers.ts';

const position = { clientId: 'cli-aster', targetId: 'bill-002', stance: 'oppose', rationale: 'Test position' };
const positions = (s: ReturnType<typeof freshStore>) => s.as(principal).list('ClientPosition', (p) => p.targetId === 'bill-002');

describe('approval gate', () => {
  it('holds a consultant position change until the principal approves', () => {
    const s = freshStore();
    const res = s.applyAction(asterConsultant, 'setClientPosition', position);
    expect(res.status).toBe('pending_approval');
    expect(positions(s)).toHaveLength(0);
    expect(s.pendingApprovals(principal)[0]).toMatchObject({ action: 'setClientPosition', requestedBy: 'consultant-aster-1', approverRole: 'principal' });
  });

  it('only the principal can approve; it then runs with approvedBy recorded', () => {
    const s = freshStore();
    s.applyAction(asterConsultant, 'setClientPosition', position);
    const [pending] = s.pendingApprovals(principal);
    expect(codeOf(() => s.approve(asterConsultant, pending.id))).toBe('PERMISSION_DENIED');
    s.approve(principal, pending.id);
    expect(positions(s)[0]).toMatchObject({ stance: 'oppose', setBy: 'consultant-aster-1', approvedBy: 'principal-1' });
    expect(s.pendingApprovals(principal)).toHaveLength(0);
    expect(s.auditEntries(principal).filter((a) => a.action === 'setClientPosition').map((a) => a.status)).toEqual(['pending_approval', 'executed']);
  });

  it('a rejected request never executes', () => {
    const s = freshStore();
    s.applyAction(asterConsultant, 'setClientPosition', position);
    s.reject(principal, s.pendingApprovals(principal)[0].id);
    expect(positions(s)).toHaveLength(0);
    expect(s.auditEntries(principal).at(-1)?.status).toBe('rejected');
  });

  it('the principal acting directly needs no second approval', () => {
    expect(freshStore().applyAction(principal, 'setClientPosition', position).status).toBe('executed');
  });

  it('send is blocked until the principal approves the deliverable', () => {
    const s = freshStore();
    const id = s.applyAction(asterConsultant, 'draftDeliverable', { clientId: 'cli-aster', kind: 'issue_brief', title: 'Brief', body: 'Body' }).created[0];
    const send = () => s.applyAction(asterConsultant, 'sendDeliverable', { deliverableId: id });
    expect(codeOf(send)).toBe('PRECONDITION_FAILED');
    s.applyAction(asterConsultant, 'submitForReview', { deliverableId: id });
    expect(codeOf(send)).toBe('PRECONDITION_FAILED');
    expect(codeOf(() => s.applyAction(asterConsultant, 'approveDeliverable', { deliverableId: id }))).toBe('PERMISSION_DENIED');
    s.applyAction(principal, 'approveDeliverable', { deliverableId: id });
    expect(codeOf(() => s.applyAction(ctx('agent', ['cli-aster']), 'sendDeliverable', { deliverableId: id }))).toBe('PERMISSION_DENIED');
    send();
    expect(s.as(principal).get(id)).toMatchObject({ status: 'sent', approvedBy: 'principal-1' });
    expect(s.auditEntries(principal).at(-1)).toMatchObject({ action: 'sendDeliverable', approvedBy: 'principal-1', status: 'executed' });
  });
});

describe('audit log', () => {
  it('records refusals raised inside an action, not only at the role and parameter checks', () => {
    const s = freshStore();
    const agent = ctx('agent', ['cli-aster']);
    const sys = ctx('system', []);
    const count = () => s.auditEntries(principal).length;
    const n = count();
    // Parameters are well-formed, but the effect refuses: no link target, and a stage that moves backwards.
    expect(codeOf(() => s.applyAction(agent, 'triageSignal', { signalId: 'sig-140', relevance: 0.9 }))).toBe('INVALID_PARAMS');
    expect(codeOf(() => s.applyAction(sys, 'updateBillStage', { billId: 'bill-001', stage: 'submitted', date: '2026-11-16' }))).toBe('INVALID_PARAMS');
    expect(count()).toBe(n + 2);
    expect(s.auditEntries(principal).slice(-2).map((a) => [a.action, a.status])).toEqual([['triageSignal', 'denied'], ['updateBillStage', 'denied']]);
    expect(s.auditEntries(principal).at(-1)!.error).toMatch(/move forward/);
    expect(s.as(principal).get('sig-140')!.status).toBe('new'); // nothing was written
  });

  it('notifies listeners only after an approved request is marked approved', () => {
    const s = freshStore();
    s.applyAction(asterConsultant, 'setClientPosition', position);
    const id = s.pendingApprovals(principal)[0].id;
    const seen: number[] = [];
    s.subscribe(() => seen.push(s.pendingApprovals(principal).length));
    s.approve(principal, id);
    expect(seen.at(-1)).toBe(0);
  });

  it('follow-up task titles are cut at a word boundary', () => {
    const s = freshStore();
    const question = 'Meet the chair of the Public Administration and Security Committee before the full committee takes up the sidewalk robot duties bill?';
    const id = s.applyAction(principal, 'raiseDecision', { clientId: 'cli-aster', question, recommendation: 'Yes.', alternatives: [], raisedById: 'task-aster-3' }).created[0];
    s.applyAction(principal, 'resolveDecision', { decisionId: id, resolution: 'approve' });
    const task = s.as(principal).list('Task', (t) => t.subjectId === id)[0];
    const q = String(s.as(principal).get(id)!.question);
    const cut = task.title.replace(/^Follow up: /, '').replace(/\.\.\.$/, '');
    expect(q.startsWith(cut)).toBe(true);
    expect(q[cut.length]).toBe(' ');
  });

  it('is append-only and immutable', () => {
    const s = freshStore();
    s.applyAction(principal, 'createTask', { clientId: 'cli-aster', title: 'T', dueDate: '2026-11-20', owner: 'human' });
    const entry = s.auditEntries(principal)[0];
    expect(entry).toMatchObject({ actor: 'principal-1', role: 'principal', action: 'createTask', status: 'executed' });
    expect(entry.after).toHaveLength(1);
    expect(() => { (entry as { actor: string }).actor = 'someone-else'; }).toThrow();
    expect(() => { (entry.params as Record<string, unknown>).title = 'changed'; }).toThrow();
    s.applyAction(principal, 'completeTask', { taskId: entry.after[0] });
    expect(s.auditEntries(principal)).toHaveLength(2);
    expect(s.auditEntries(principal)[0]).toBe(entry);
  });

  it('records before and after for updates', () => {
    const s = freshStore();
    s.applyAction(ctx('system', []), 'updateBillStage', { billId: 'bill-002', stage: 'subcommittee', date: '2026-11-16' });
    const e = s.auditEntries(principal).at(-1)!;
    expect(e.before).toEqual(['bill-002']);
    expect(e.changes['bill-002'].stage).toEqual(['committee_review', 'subcommittee']);
  });
});

describe('stage and evidence actions', () => {
  it('stages only move forward', () => {
    const s = freshStore();
    const sys = ctx('system', []);
    expect(codeOf(() => s.applyAction(sys, 'updateBillStage', { billId: 'bill-001', stage: 'submitted', date: '2026-11-16' }))).toBe('INVALID_PARAMS');
    expect(codeOf(() => s.applyAction(sys, 'updateBillStage', { billId: 'bill-001', stage: 'committee_passed', date: '2026-11-01' }))).toBe('INVALID_PARAMS');
  });

  it('low-confidence evidence goes to the review queue; rejecting it removes the unsupported link', () => {
    const s = freshStore();
    const agent = ctx('agent', ['cli-aster']);
    const before = s.reviewQueue(agent).length;
    const res = s.applyAction(agent, 'linkEvidence', { linkType: 'about', from: 'bill-002', to: 'iss-04', excerpt: 'Maybe related', confidence: 0.55 });
    const evId = res.created.find((id) => id.startsWith('ev-'))!;
    expect(s.reviewQueue(agent)).toHaveLength(before + 1);
    expect(s.as(agent).links({ type: 'about', from: 'bill-002', to: 'iss-04' })).toHaveLength(1);
    s.applyAction(ctx('consultant', ['cli-aster']), 'reviewEvidence', { evidenceId: evId, verdict: 'reject' });
    expect(s.as(agent).links({ type: 'about', from: 'bill-002', to: 'iss-04' })).toHaveLength(0);
  });

  it('rejects links the schema does not allow', () => {
    const s = freshStore();
    expect(codeOf(() => s.applyAction(ctx('agent'), 'linkEvidence', { linkType: 'sponsors', from: 'bill-001', to: 'bill-002', excerpt: 'x', confidence: 0.9 }))).toBe('INVALID_PARAMS');
  });

  it('evidence method comes from the role: an agent cannot mark its own low-confidence link as human-checked', () => {
    const s = freshStore();
    const agent = ctx('agent', ['cli-aster']);
    const claim = { linkType: 'about', from: 'bill-020', to: 'iss-01', excerpt: 'x', confidence: 0.1 };
    expect(codeOf(() => s.applyAction(agent, 'linkEvidence', { ...claim, method: 'human' }))).toBe('INVALID_PARAMS');
    const ev = s.as(agent).get(s.applyAction(agent, 'linkEvidence', claim).created.find((id) => id.startsWith('ev-'))!)!;
    expect(ev).toMatchObject({ method: 'rule', reviewStatus: 'review' });
    const human = s.as(principal).get(s.applyAction(ctx('consultant', ['cli-aster']), 'linkEvidence', { ...claim, to: 'iss-02' }).created.find((id) => id.startsWith('ev-'))!)!;
    expect(human).toMatchObject({ method: 'human', reviewStatus: 'accepted' });
  });

  it('a passed bill is final: it cannot be withdrawn or merged afterwards', () => {
    const s = freshStore();
    const sys = ctx('system', []);
    expect(s.as(principal).get('bill-017')!.stage).toBe('passed');
    expect(codeOf(() => s.applyAction(sys, 'updateBillStage', { billId: 'bill-017', stage: 'withdrawn', date: '2026-11-16' }))).toBe('INVALID_PARAMS');
    expect(codeOf(() => s.applyAction(sys, 'updateBillStage', { billId: 'bill-017', stage: 'merged_alternative', date: '2026-11-16', mergedInto: 'bill-032' }))).toBe('INVALID_PARAMS');
    expect(s.as(principal).get('bill-017')!.stage).toBe('passed');
  });

  it('a signal can be triaged only once per client, and never changes the public record', () => {
    const s = freshStore();
    const sig = s.as(principal).list('Signal', (x) => x.status === 'new')[0];
    const agent = ctx('agent', ['cli-aster']);
    s.applyAction(agent, 'triageSignal', { clientId: 'cli-aster', signalId: sig.id, dismiss: true, relevance: 0.1 });
    expect(codeOf(() => s.applyAction(agent, 'triageSignal', { clientId: 'cli-aster', signalId: sig.id, dismiss: true, relevance: 0.1 }))).toBe('PRECONDITION_FAILED');
    expect(s.as(principal).get(sig.id)).toEqual(sig); // the Signal is untouched
    // Moru's queue still has it: Aster's filing lives in Aster's layer.
    s.applyAction(ctx('agent', ['cli-moru']), 'triageSignal', { clientId: 'cli-moru', signalId: sig.id, dismiss: true, relevance: 0.1 });
    expect(s.as(ctx('principal', ['cli-moru'])).list('SignalTriage').map((t) => t.clientId)).toEqual(['cli-moru']);
  });

  it('a government bill gets its number when it leaves legislative notice', () => {
    const s = freshStore();
    const sys = ctx('system', []);
    expect(s.as(principal).get('bill-026')).not.toHaveProperty('billNo');
    expect(codeOf(() => s.applyAction(sys, 'updateBillStage', { billId: 'bill-026', stage: 'submitted', date: '2026-12-01' }))).toBe('INVALID_PARAMS');
    s.applyAction(sys, 'updateBillStage', { billId: 'bill-026', stage: 'submitted', date: '2026-12-01', billNo: '22-S9001' });
    expect(s.as(principal).get('bill-026')).toMatchObject({ stage: 'submitted', billNo: '22-S9001' });
  });

  it('undo returns a filed item to the queue and removes the links that rested only on it', () => {
    const s = freshStore();
    const sig = s.as(principal).list('Signal', (x) => x.status === 'new' && x.rawText.includes('22-S0308'))[0];
    s.applyAction(ctx('agent', ['cli-aster']), 'triageSignal', { clientId: 'cli-aster', signalId: sig.id, relevance: 0.95, issueId: 'iss-01', billId: 'bill-001' });
    expect(s.as(principal).links({ type: 'about', from: sig.id })).toHaveLength(1);
    expect(codeOf(() => s.applyAction(ctx('agent', ['cli-aster']), 'reopenSignal', { clientId: 'cli-aster', signalId: sig.id }))).toBe('PERMISSION_DENIED');
    s.applyAction(ctx('principal', ['cli-aster']), 'reopenSignal', { clientId: 'cli-aster', signalId: sig.id });
    const v = s.as(principal);
    expect(v.get(sig.id)).toMatchObject({ status: 'new' });
    expect(v.list('SignalTriage', (t) => t.signalId === sig.id).map((t) => t.status)).toEqual(['returned']);
    expect(v.links({ from: sig.id })).toEqual([]);
    expect(v.list('Evidence', (e) => e.signalId === sig.id).every((e) => e.reviewStatus === 'rejected')).toBe(true);
    expect(codeOf(() => s.applyAction(ctx('principal', ['cli-aster']), 'reopenSignal', { clientId: 'cli-aster', signalId: sig.id }))).toBe('PRECONDITION_FAILED');
  });
});
