// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Every judgment traces back to records: impact ratings are assessed and approved objects, a decision links to what it
// rests on and notices when any of it changes, and a collected stage change points at the record it was read from.
import { describe, expect, it } from 'vitest';
import { impactOf, responseFacts } from '../ontology/index.ts';
import { decisionStale, runWeeklyAgent } from '../agent/index.ts';
import { asterConsultant, ctx, freshStore, principal } from './helpers.ts';

const lead = ctx('principal', ['cli-aster'], 'principal-1');

describe('judgments trace back to records', () => {
  it('impact is an assessed object; an analyst rating waits for the head of government affairs', () => {
    const s = freshStore();
    const before = impactOf(s.as(lead), 'iss-03', 'cli-aster')!;
    expect(before).toMatchObject({ level: 'medium', approvedBy: 'principal-1' });
    expect(before.rationale.length).toBeGreaterThan(10);
    s.applyAction(asterConsultant, 'assessImpact', { clientId: 'cli-aster', issueId: 'iss-03', level: 'high', rationale: 'Insurers now price per robot.' });
    expect(impactOf(s.as(lead), 'iss-03', 'cli-aster')!.level).toBe('medium');
    const [p] = s.pendingApprovals(lead).filter((x) => x.action === 'assessImpact');
    s.approve(lead, p.id);
    expect(impactOf(s.as(lead), 'iss-03', 'cli-aster')).toMatchObject({ level: 'high', assessedBy: 'consultant-aster-1', approvedBy: 'principal-1' });
    expect(responseFacts(s.as(lead), 'bill-008', 'cli-aster', '2026-11-09').impact).toBe('high');
    // Another company never sees the rating.
    expect(impactOf(s.as(ctx('principal', ['cli-moru'])), 'iss-03', 'cli-aster')).toBeUndefined();
  });

  it('a decision links to the meeting, the assessment, the position and the impact rating it rests on', async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const v = s.as(lead);
    const types = v.targets(run.decisionId!, 'derived_from').map((o) => o.type).sort();
    expect(types).toEqual(['ClientPosition', 'Event', 'ImpactAssessment', 'StakeholderAssessment']);
  });

  it('a decision is out of date when its meeting moves or the company position changes', async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const d = () => s.as(lead).get(run.decisionId!)!;
    expect(decisionStale(s.as(lead), d())).toBeUndefined();
    const pos = s.as(lead).get(d().premise.positionId)!;
    s.applyAction(lead, 'setClientPosition', { clientId: 'cli-aster', targetId: pos.targetId, stance: 'support', rationale: 'Leadership accepts the subcommittee text.' });
    expect(decisionStale(s.as(lead), d())).toBe('company position changed');
  });

  it('a collected stage change keeps the record it was read from', () => {
    const s = freshStore();
    const v = s.as(principal);
    const withSource = v.list('Bill').flatMap((b) => b.stageHistory as { sourceId?: string }[]).filter((h) => h.sourceId);
    expect(withSource.length).toBeGreaterThan(5);
    expect(withSource.every((h) => v.get(h.sourceId!)?.type === 'Signal')).toBe(true);
    const sig = v.list('Signal')[0];
    s.applyAction(ctx('system', []), 'updateBillStage', { billId: 'bill-002', stage: 'subcommittee', date: '2026-11-16', signalId: sig.id });
    expect((s.as(principal).get('bill-002')!.stageHistory as { sourceId?: string }[]).at(-1)!.sourceId).toBe(sig.id);
  });
});
