// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { describe, expect, it } from 'vitest';
import { stageGates, stakeholderNetwork } from '../ontology/functions.ts';
import { validateWorld } from '../ontology/validate.ts';
import { asterConsultant, codeOf, ctx, freshStore, loadWorld, principal } from './helpers.ts';

const lead = (clientId: string) => ctx('principal', [clientId], 'principal-1');
const agent = (clientId: string) => ctx('agent', [clientId], 'agent-1');
const moruConsultant = ctx('consultant', ['cli-moru'], 'consultant-moru-1');

describe('client layer in the sample world', () => {
  const w = loadWorld();
  const of = (type: string, clientId: string) => w.objects.filter((o) => o.type === type && o.clientId === clientId);

  it('every client has assessments (some unconfirmed), 2-4 risks or opportunities, a strategy per watched issue and asks of the client', () => {
    for (const c of ['cli-aster', 'cli-moru', 'cli-wren']) {
      const sa = of('StakeholderAssessment', c);
      expect(sa.length, c).toBeGreaterThanOrEqual(5);
      expect(sa.some((a) => a.stance === 'unconfirmed'), c).toBe(true);
      expect(sa.filter((a) => a.stance !== 'unconfirmed').every((a) => a.basisIds?.length > 0), c).toBe(true);
      const ro = of('RiskOpportunity', c);
      expect(ro.length).toBeGreaterThanOrEqual(2);
      expect(ro.length).toBeLessThanOrEqual(4);
      expect(new Set(ro.map((r) => r.kind))).toEqual(new Set(['risk', 'opportunity']));
      const watchedIssues = w.links.filter((l) => l.type === 'watches' && l.from === `eng-${c.slice(4)}` && l.to.startsWith('iss-')).map((l) => l.to).sort();
      expect(of('Strategy', c).map((s) => s.issueId).sort()).toEqual(watchedIssues);
      expect(of('Task', c).some((t) => t.owner === 'client' && t.status === 'open')).toBe(true);
    }
  });

  it("a client's read of a person lives in that client's layer, never on the public record", () => {
    const jang = of('StakeholderAssessment', 'cli-aster').find((a) => a.subjectId === 'per-005')!;
    expect(jang).toMatchObject({ stance: 'unconfirmed', influence: 'high', markings: ['CLIENT:cli-aster'] });
    expect(w.objects.find((o) => o.id === 'per-005')).not.toHaveProperty('stance');
    expect(of('StakeholderAssessment', 'cli-moru').some((a) => a.subjectId === 'per-005')).toBe(false);
  });

  it('the validator rejects a stance without a basis and a strategy target on another issue', () => {
    const v = loadWorld();
    const a = v.objects.find((o) => o.type === 'StakeholderAssessment' && o.stance === 'supportive')!;
    delete a.basisIds;
    const s = v.objects.find((o) => o.id === 'str-aster-01')!;
    s.targetIds = [...s.targetIds, v.objects.find((o) => o.type === 'StakeholderAssessment' && o.clientId === 'cli-aster' && o.issueId === 'iss-02')!.id];
    const errors = validateWorld(v).join('\n');
    expect(errors).toMatch(/without a basis record/);
    expect(errors).toMatch(/is on another issue/);
  });
});

describe('assessment isolation', () => {
  const s = freshStore();
  it("Aster never sees Moru's or Wrenfield Pay's assessments", () => {
    const aster = s.as(asterConsultant);
    const all = s.as(principal).list('StakeholderAssessment');
    expect(all.some((a) => a.clientId !== 'cli-aster')).toBe(true);
    expect(aster.list('StakeholderAssessment').every((a) => a.clientId === 'cli-aster')).toBe(true);
    for (const a of all.filter((x) => x.clientId !== 'cli-aster')) expect(aster.get(a.id)).toBeUndefined();
    expect(aster.list('Strategy').every((x) => x.clientId === 'cli-aster')).toBe(true);
    expect(aster.list('RiskOpportunity').every((x) => x.clientId === 'cli-aster')).toBe(true);
  });

  it('stakeholderNetwork only works for a client the caller can see', () => {
    expect(() => stakeholderNetwork(s.as(asterConsultant), 'cli-moru', 'iss-06')).toThrow(/not accessible/);
    expect(stakeholderNetwork(s.as(moruConsultant), 'cli-moru', 'iss-06').nodes.every((n) => n.assessment.clientId === 'cli-moru')).toBe(true);
  });

  it("an Aster assessment cannot rest on a Moru meeting record", () => {
    expect(codeOf(() => s.applyAction(asterConsultant, 'assessStakeholder', {
      clientId: 'cli-aster', subjectId: 'per-031', issueId: 'iss-01', stance: 'neutral', influence: 'low', relevance: 'low', basisIds: ['int-moru-1'],
    }))).toBe('INVALID_PARAMS');
  });
});

describe('assessStakeholder', () => {
  const params = { clientId: 'cli-aster', subjectId: 'per-005', issueId: 'iss-01', influence: 'high', relevance: 'medium' };

  it('is for humans only', () => {
    expect(codeOf(() => freshStore().applyAction(agent('cli-aster'), 'assessStakeholder', { ...params, stance: 'unconfirmed' }))).toBe('PERMISSION_DENIED');
  });

  it('refuses a stance without a basis and accepts unconfirmed', () => {
    const s = freshStore();
    expect(codeOf(() => s.applyAction(asterConsultant, 'assessStakeholder', { ...params, stance: 'supportive' }))).toBe('INVALID_PARAMS');
    expect(s.applyAction(asterConsultant, 'assessStakeholder', { ...params, stance: 'unconfirmed' }).status).toBe('executed');
  });

  it('replaces the existing read for the same client, subject and issue', () => {
    const s = freshStore();
    const before = s.as(principal).list('StakeholderAssessment', (a) => a.clientId === 'cli-aster' && a.subjectId === 'per-005' && a.issueId === 'iss-01');
    expect(before).toHaveLength(1);
    const res = s.applyAction(asterConsultant, 'assessStakeholder', { ...params, stance: 'supportive', basisIds: ['evt-014'] });
    expect(res.created).toEqual([]);
    expect(res.updated).toEqual([before[0].id]);
    expect(s.as(principal).get(before[0].id)).toMatchObject({ stance: 'supportive', basisIds: ['evt-014'], assessedBy: 'consultant-aster-1', markings: ['CLIENT:cli-aster'] });
    expect(validateWorld(s.snapshot().world)).toEqual([]);
  });
});

describe('addRiskOpportunity and updateStrategy go through the approval gate', () => {
  const risk = { clientId: 'cli-aster', kind: 'risk', title: 'New risk', summary: 'Summary', impact: 'medium', urgency: 'in_progress', subjectIds: ['bill-002'] };

  it('an agent proposal waits for the engagement lead, then runs with the approver recorded', () => {
    const s = freshStore();
    const res = s.applyAction(agent('cli-aster'), 'addRiskOpportunity', risk);
    expect(res.status).toBe('pending_approval');
    expect(s.as(principal).list('RiskOpportunity', (r) => r.title === 'New risk')).toEqual([]);
    const [p] = s.pendingApprovals(lead('cli-aster'));
    expect(s.pendingApprovals(lead('cli-moru'))).toEqual([]); // another client's lead does not see it
    s.approve(lead('cli-aster'), p.id);
    expect(s.as(principal).list('RiskOpportunity', (r) => r.title === 'New risk')[0]).toMatchObject({ addedBy: 'agent-1', approvedBy: 'principal-1' });
    const log = s.auditEntries(lead('cli-aster')).filter((a) => a.action === 'addRiskOpportunity');
    expect(log.map((a) => [a.role, a.status, a.approvedBy])).toEqual([['agent', 'pending_approval', undefined], ['agent', 'executed', 'principal-1']]);
  });

  it('needs at least one subject', () => {
    expect(codeOf(() => freshStore().applyAction(lead('cli-aster'), 'addRiskOpportunity', { ...risk, subjectIds: [] }))).toBe('INVALID_PARAMS');
  });

  it('a consultant strategy change waits; the lead edits directly; targets must be on the same issue', () => {
    const s = freshStore();
    const msg = { clientId: 'cli-aster', issueId: 'iss-01', messages: ['One message.'] };
    expect(s.applyAction(asterConsultant, 'updateStrategy', msg).status).toBe('pending_approval');
    expect(s.applyAction(lead('cli-aster'), 'updateStrategy', msg).status).toBe('executed');
    expect(s.as(principal).get('str-aster-01')).toMatchObject({ messages: ['One message.'], updatedBy: 'principal-1' });
    const other = s.as(principal).list('StakeholderAssessment', (a) => a.clientId === 'cli-aster' && a.issueId === 'iss-02')[0].id;
    expect(codeOf(() => s.applyAction(lead('cli-aster'), 'updateStrategy', { clientId: 'cli-aster', issueId: 'iss-01', targetIds: [other] }))).toBe('INVALID_PARAMS');
    expect(codeOf(() => s.applyAction(lead('cli-aster'), 'updateStrategy', { clientId: 'cli-aster', issueId: 'iss-05' }))).toBe('INVALID_PARAMS'); // new: needs outcome and messages
    expect(codeOf(() => s.applyAction(agent('cli-aster'), 'updateStrategy', msg))).toBe('PERMISSION_DENIED');
  });

  it('tasks can be owned by the client', () => {
    const s = freshStore();
    const id = s.applyAction(lead('cli-aster'), 'createTask', { clientId: 'cli-aster', title: 'Send data', dueDate: '2026-11-20', owner: 'client' }).created[0];
    expect(s.as(principal).get(id)).toMatchObject({ owner: 'client', status: 'open' });
  });
});

describe('activity log markings for public objects touched in a client workspace', () => {
  it("triaging a signal for Aster is filed under Aster, so Moru's log never shows what Aster is watching", () => {
    const s = freshStore();
    const sig = s.as(principal).list('Signal', (x) => x.status === 'new')[0];
    s.applyAction(asterConsultant, 'triageSignal', { clientId: 'cli-aster', signalId: sig.id, relevance: 0.9, issueId: 'iss-01' });
    const entry = s.auditEntries(principal).at(-1)!;
    expect(entry).toMatchObject({ action: 'triageSignal', status: 'executed', markings: ['CLIENT:cli-aster'] });
    expect(s.auditEntries(moruConsultant)).toEqual([]);
    expect(s.auditEntries(asterConsultant)).toHaveLength(1);
  });

  it('the collector (no client) still writes public entries', () => {
    const s = freshStore();
    s.applyAction(ctx('system', []), 'updateBillStage', { billId: 'bill-002', stage: 'subcommittee', date: '2026-11-16' });
    expect(s.auditEntries(moruConsultant).at(-1)).toMatchObject({ action: 'updateBillStage', markings: ['PUBLIC'] });
  });
});

describe('stageGates', () => {
  const v = freshStore().as(lead('cli-aster'));

  it('the sidewalk bill: subcommittee cleared 11-12, full committee next on 11-19, chairs listed first', () => {
    const [sub, com, lj, plen] = stageGates(v, 'bill-001');
    expect(sub).toMatchObject({ key: 'subcommittee', status: 'done', date: '2026-11-12', institutionId: 'inst-pasc-brs' });
    expect(sub.deciders).toEqual([{ id: 'per-004', name: 'Ryu Taehwan', role: 'chair' }]); // the majority secretary chairs the subcommittee
    expect(com).toMatchObject({ key: 'committee', status: 'next', date: '2026-11-19', scheduled: true, institutionId: 'inst-pasc' });
    expect(com.deciders.map((d) => d.role)).toEqual(['chair', 'secretary', 'secretary']);
    expect(com.deciders[0].name).toBe('Seo Haeun');
    expect(lj).toMatchObject({ key: 'lj', status: 'later', scheduled: false });
    expect(lj.date).toBeUndefined();
    expect(plen).toMatchObject({ key: 'plenary', status: 'later', deciders: [] });
  });

  it('a committee alternative in LJC review has its committee and LJC dates; a merged bill is closed', () => {
    // An alternative is born at the full committee vote, so it has no subcommittee date of its own.
    expect(stageGates(v, 'bill-031').map((g) => [g.key, g.status, g.date])).toEqual([
      ['subcommittee', 'done', undefined], ['committee', 'done', '2026-10-16'], ['lj', 'next', '2026-11-23'], ['plenary', 'later', undefined],
    ]);
    expect(stageGates(v, 'bill-009').every((g) => g.status === 'closed')).toBe(true);
  });
});

describe('stakeholderNetwork', () => {
  const v = freshStore().as(lead('cli-aster'));
  const net = stakeholderNetwork(v, 'cli-aster', 'iss-01');

  it("returns Aster's assessed stakeholders on the issue with one edge per connected pair", () => {
    expect(net.nodes).toHaveLength(9);
    expect(net.nodes.every((n) => n.assessment.issueId === 'iss-01' && n.subject.id === n.assessment.subjectId)).toBe(true);
    const pairs = net.edges.map((e) => `${e.a}|${e.b}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(new Set(net.edges.map((e) => e.kind))).toEqual(new Set(['cosponsor', 'committee', 'event']));
  });

  it('every edge rests on visible public records, and event edges always include an organization', () => {
    for (const e of net.edges) {
      expect(e.basisIds.length).toBeGreaterThan(0);
      expect(e.basisIds.every((id) => v.get(id)?.markings[0] === 'PUBLIC')).toBe(true);
      if (e.kind === 'event') expect([e.a, e.b].some((id) => id.startsWith('org-'))).toBe(true);
    }
    expect(net.edges.find((e) => e.a === 'per-001' && e.b === 'per-004')).toMatchObject({ kind: 'cosponsor', basisIds: ['bill-001'] });
    expect(net.edges.find((e) => e.a === 'per-004' && e.b === 'per-005')).toMatchObject({ kind: 'committee', basisIds: ['inst-pasc', 'inst-pasc-brs'] });
  });
});
