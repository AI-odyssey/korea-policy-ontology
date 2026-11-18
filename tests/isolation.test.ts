// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { describe, expect, it } from 'vitest';
import { billRiskScore, upcomingDeadlines } from '../ontology/functions.ts';
import { validateWorld } from '../ontology/validate.ts';
import { asterConsultant, codeOf, ctx, freshStore, principal } from './helpers.ts';

const moruConsultant = ctx('consultant', ['cli-moru'], 'consultant-moru-1');

describe('cross-client isolation', () => {
  const s = freshStore();
  const aster = s.as(asterConsultant);
  const moruPositions = s.as(principal).list('ClientPosition').filter((p) => p.clientId === 'cli-moru');

  it('Aster context cannot read Moru positions, interactions or the client itself', () => {
    expect(moruPositions.length).toBeGreaterThan(0);
    for (const p of moruPositions) expect(aster.get(p.id)).toBeUndefined();
    expect(aster.list('ClientPosition').every((p) => p.clientId === 'cli-aster')).toBe(true);
    expect(aster.list('Interaction').every((p) => p.clientId === 'cli-aster')).toBe(true);
    expect(aster.get('cli-moru')).toBeUndefined();
    expect(aster.get('eng-moru')).toBeUndefined();
  });

  it('links into another client layer are invisible', () => {
    expect(aster.links({ type: 'affects' }).every((l) => l.to === 'cli-aster')).toBe(true);
    expect(aster.links({ type: 'watches' }).every((l) => l.from === 'eng-aster')).toBe(true);
    expect(aster.sources('cli-moru', 'affects')).toEqual([]);
  });

  it('public objects stay visible to every client', () => {
    expect(aster.get('bill-001')).toBeDefined();
    expect(aster.get('bill-013')).toBeDefined();
  });

  it('actions cannot reference or write into another client layer', () => {
    expect(codeOf(() => s.applyAction(asterConsultant, 'createTask', { clientId: 'cli-moru', title: 'x', dueDate: '2026-11-20', owner: 'human' }))).toBe('INVALID_PARAMS');
    expect(codeOf(() => s.applyAction(asterConsultant, 'submitForReview', { deliverableId: 'del-moru-2' }))).toBe('INVALID_PARAMS');
  });

  it('functions refuse another client', () => {
    expect(() => billRiskScore(aster, 'bill-013', 'cli-moru')).toThrow(/not accessible/);
    expect(() => upcomingDeadlines(aster, 'cli-moru')).toThrow();
  });
});

describe('filing is a client judgment', () => {
  it("one client's filing adds no link or evidence that another client can see", () => {
    const s = freshStore();
    const sig = s.as(principal).list('Signal', (x) => x.status === 'new')[0];
    const before = s.as(moruConsultant).links({ from: sig.id }).length;
    s.applyAction(asterConsultant, 'triageSignal', { clientId: 'cli-aster', signalId: sig.id, issueId: 'iss-10', relevance: 0.9, confidence: 0.9 });
    const aster = s.as(asterConsultant);
    const filed = aster.links({ from: sig.id }).filter((l) => l.to === 'iss-10');
    expect(filed).toHaveLength(1);
    expect(filed[0].markings).toEqual(['CLIENT:cli-aster']);
    const moru = s.as(moruConsultant);
    expect(moru.links({ from: sig.id })).toHaveLength(before);
    for (const id of filed[0].evidence) expect(moru.get(id)).toBeUndefined();
  });
});

describe('cross-client references', () => {
  // A caller assigned to both clients can see both layers, so only the one-layer-per-call rule stops these.
  const both = ctx('consultant', ['cli-aster', 'cli-moru'], 'consultant-both');

  it('one call may not join two client layers', () => {
    const s = freshStore();
    expect(codeOf(() => s.applyAction(both, 'createTask', { clientId: 'cli-aster', title: 'x', dueDate: '2026-11-20', owner: 'human', subjectId: 'pos-moru-1' }))).toBe('INVALID_PARAMS');
    expect(codeOf(() => s.applyAction(both, 'draftDeliverable', { clientId: 'cli-aster', kind: 'issue_brief', title: 't', body: 'b', sourceIds: ['bill-018', 'pos-moru-3'] }))).toBe('INVALID_PARAMS');
    expect(codeOf(() => s.applyAction(both, 'raiseDecision', { clientId: 'cli-aster', question: 'q', recommendation: 'r', alternatives: [], raisedById: 'task-moru-1' }))).toBe('INVALID_PARAMS');
    expect(s.as(principal).list('Task', (t) => t.subjectId === 'pos-moru-1')).toEqual([]);
  });

  it('the same calls inside one layer succeed, and the world still validates afterwards', () => {
    const s = freshStore();
    s.applyAction(both, 'createTask', { clientId: 'cli-aster', title: 'x', dueDate: '2026-11-20', owner: 'human', subjectId: 'pos-aster-1' });
    s.applyAction(both, 'draftDeliverable', { clientId: 'cli-aster', kind: 'issue_brief', title: 't', body: 'b', sourceIds: ['bill-001', 'pos-aster-1'] });
    expect(validateWorld(s.snapshot().world)).toEqual([]);
  });
});

describe('stored records cannot be changed from outside', () => {
  it('records and links handed out by a view are frozen', () => {
    const s = freshStore();
    const v = s.as(asterConsultant);
    const pos = v.get('pos-aster-1')!;
    expect(() => { pos.markings = ['PUBLIC']; }).toThrow(TypeError);
    expect(() => { pos.markings.push('PUBLIC'); }).toThrow(TypeError);
    expect(() => { pos.stance = 'support'; }).toThrow(TypeError);
    expect(s.as(moruConsultant).get('pos-aster-1')).toBeUndefined();
    const link = v.links({ type: 'sponsors', to: 'bill-001' })[0];
    expect(() => { link.evidence.push('ev-fake'); }).toThrow(TypeError);
    expect(() => { (v.get('bill-001')!.stageHistory as unknown[]).push({}); }).toThrow(TypeError);
  });

  it('records written by actions are frozen too', () => {
    const s = freshStore();
    const id = s.applyAction(asterConsultant, 'createTask', { clientId: 'cli-aster', title: 'T', dueDate: '2026-11-20', owner: 'human' }).created[0];
    const task = s.as(asterConsultant).get(id)!;
    expect(() => { task.status = 'done'; }).toThrow(TypeError);
    const res = s.applyAction(ctx('agent', ['cli-aster']), 'linkEvidence', { linkType: 'about', from: 'bill-002', to: 'iss-04', excerpt: 'x', confidence: 0.9 });
    const link = s.as(principal).links({ type: 'about', from: 'bill-002', to: 'iss-04' })[0];
    expect(link.evidence).toEqual(res.created.filter((x) => x.startsWith('ev-')));
    expect(Object.isFrozen(link.evidence)).toBe(true);
  });

  it('a pending request handed out for review is a copy: editing it does not change what runs', () => {
    const s = freshStore();
    s.applyAction(asterConsultant, 'setClientPosition', { clientId: 'cli-aster', targetId: 'bill-002', stance: 'oppose', rationale: 'r' });
    const [p] = s.pendingApprovals(principal);
    (p.params as Record<string, unknown>).stance = 'support';
    p.status = 'approved';
    expect(s.pendingApprovals(principal)[0]).toMatchObject({ status: 'pending', params: { stance: 'oppose' } });
    s.approve(principal, p.id);
    expect(s.as(principal).list('ClientPosition', (x) => x.targetId === 'bill-002')[0].stance).toBe('oppose');
  });
});

describe('audit log isolation', () => {
  it("each client's workspace sees its own entries and never another client's", () => {
    const s = freshStore();
    const moruTask = s.applyAction(moruConsultant, 'createTask', { clientId: 'cli-moru', title: 'Moru follow-up', dueDate: '2026-11-20', owner: 'human' }).created[0];
    s.applyAction(asterConsultant, 'createTask', { clientId: 'cli-aster', title: 'Aster follow-up', dueDate: '2026-11-20', owner: 'human' });
    expect(codeOf(() => s.applyAction(asterConsultant, 'submitForReview', { deliverableId: 'del-moru-2' }))).toBe('INVALID_PARAMS');

    const asterLog = s.auditEntries(asterConsultant);
    const moruLog = s.auditEntries(moruConsultant);
    expect(asterLog.map((a) => a.status)).toEqual(['executed', 'denied']); // not empty, so the checks below mean something
    expect(asterLog.every((a) => a.markings.every((m) => m === 'PUBLIC' || m === 'CLIENT:cli-aster'))).toBe(true);
    expect(JSON.stringify(asterLog)).not.toContain(moruTask);
    expect(JSON.stringify(asterLog)).not.toContain('Moru follow-up');
    expect(moruLog.map((a) => a.after)).toEqual([[moruTask]]); // Moru sees its task, not Aster's entries or Aster's refused probe
    expect(s.auditEntries(principal)).toHaveLength(3);
  });

  it('a refused call does not reveal whether a hidden object exists', () => {
    const s = freshStore();
    const probe = (id: string) => {
      const n = s.auditEntries(asterConsultant).length;
      let message = '';
      try {
        s.applyAction(asterConsultant, 'submitForReview', { deliverableId: id });
      } catch (e) {
        message = (e as Error).message.replace(id, '<id>');
      }
      const entries = s.auditEntries(asterConsultant);
      return { message, grew: entries.length - n, markings: entries.at(-1)!.markings };
    };
    const hidden = probe('del-moru-2'); // exists, in Moru's layer
    const missing = probe('del-moru-99'); // does not exist
    expect(s.as(principal).get('del-moru-2')).toBeDefined();
    expect(hidden).toEqual(missing);
    expect(hidden.grew).toBe(1);
    expect(s.auditEntries(moruConsultant)).toEqual([]);
  });
});
