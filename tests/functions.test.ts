// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { describe, expect, it } from 'vitest';
import { billRiskScore, clientBills, functions, issueExposure, keyPeople, responseLevel, RISK_WEIGHTS, upcomingDeadlines, whatChanged } from '../ontology/functions.ts';
import { functionTypes } from '../ontology/schema.ts';
import { ctx, freshStore, principal } from './helpers.ts';

const view = () => freshStore().as(principal);

describe('functions', () => {
  it('are deterministic across fresh stores', () => {
    const a = view();
    const b = view();
    expect(whatChanged(a, '2026-11-09')).toEqual(whatChanged(b, '2026-11-09'));
    expect(billRiskScore(a, 'bill-001', 'cli-aster')).toEqual(billRiskScore(b, 'bill-001', 'cli-aster'));
    expect(keyPeople(a, 'bill-001')).toEqual(keyPeople(b, 'bill-001'));
    expect(upcomingDeadlines(a, 'cli-aster')).toEqual(upcomingDeadlines(b, 'cli-aster'));
    expect(issueExposure(a, 'cli-wren')).toEqual(issueExposure(b, 'cli-wren'));
  });

  it('registry matches the schema list', () => {
    expect(Object.keys(functions).sort()).toEqual(functionTypes.map((f) => f.name).sort());
  });

  it('risk breakdown sums to the score and weights sum to 100', () => {
    const v = view();
    expect(Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    for (const [bill, client] of [['bill-001', 'cli-aster'], ['bill-013', 'cli-moru'], ['bill-023', 'cli-wren'], ['bill-004', 'cli-aster']]) {
      const r = billRiskScore(v, bill, client);
      expect(Math.round(r.components.reduce((s, c) => s + c.points, 0) * 100) / 100).toBe(r.score);
      for (const c of r.components) expect(c.points).toBeCloseTo(c.weight * c.value, 1);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("a back-dated score counts meetings held since then: Aster's sidewalk bill goes from 74 to 78.8", () => {
    const v = view();
    const before = billRiskScore(v, 'bill-001', 'cli-aster', '2026-11-09');
    const after = billRiskScore(v, 'bill-001', 'cli-aster');
    expect(before.stage).toBe('subcommittee');
    expect(after.stage).toBe('subcommittee_passed');
    // On 11-09 the 11-12 subcommittee meeting (since held) was 3 days ahead, so the calendar was already full.
    expect(before.components.find((c) => c.key === 'calendar')).toMatchObject({ value: 1, points: 20 });
    expect(before.components.find((c) => c.key === 'calendar')!.note).toMatch(/in 3 days \(2026-11-12\)/);
    expect(before.score).toBe(74);
    expect(after.score).toBe(78.8);
    expect(after.components.find((c) => c.key === 'calendar')!.note).toMatch(/in 3 days \(2026-11-19\)/);
    const change = whatChanged(v, '2026-11-09');
    expect(change.stageChanges.find((c) => c.billId === 'bill-001')).toMatchObject({ from: 'subcommittee', to: 'subcommittee_passed', date: '2026-11-12' });
    expect(change.riskChanges.find((r) => r.billId === 'bill-001' && r.clientId === 'cli-aster')).toMatchObject({ before: 74, after: 78.8, delta: 4.8 });
  });

  it('links backed only by evidence awaiting review do not count until a human accepts them', () => {
    const s = freshStore();
    const v = s.as(principal);
    const bills = clientBills(v, 'cli-aster').map((b) => b.id);
    const score = billRiskScore(v, 'bill-023', 'cli-aster').score;
    const res = s.applyAction(ctx('agent', ['cli-aster']), 'linkEvidence', { linkType: 'about', from: 'bill-023', to: 'iss-01', excerpt: 'maybe', confidence: 0.3 });
    const evId = res.created.find((id) => id.startsWith('ev-'))!;
    const after = s.as(principal);
    expect(after.links({ type: 'about', from: 'bill-023', to: 'iss-01' })).toHaveLength(1); // stored and visible
    expect(clientBills(after, 'cli-aster').map((b) => b.id)).toEqual(bills); // but not counted
    expect(billRiskScore(after, 'bill-023', 'cli-aster').score).toBe(score);
    expect(issueExposure(after, 'cli-aster').every((e) => !e.billRisks.some((r) => r.billId === 'bill-023'))).toBe(true);
    s.applyAction(ctx('consultant', ['cli-aster']), 'reviewEvidence', { evidenceId: evId, verdict: 'accept' });
    expect(clientBills(s.as(principal), 'cli-aster').map((b) => b.id)).toContain('bill-023');
  });

  it('responseLevel: act_now needs a slot within 7 days, a stance of oppose or amend, and a move this week', () => {
    const v = view();
    const r = responseLevel(v, 'bill-001', 'cli-aster');
    expect(r.level).toBe('act_now');
    expect(r.reasons).toEqual([
      'Moved to subcommittee_passed on 2026-11-12',
      'Public Administration and Security Committee meeting on 2026-11-19 (3 days)',
      'Client stance: amend',
      'Issue impact: high',
    ]);
    // Drop any one condition and it is no longer act_now.
    expect(responseLevel(v, 'bill-001', 'cli-aster', '2026-11-12').level).toBe('engage'); // no move after 11-12
    expect(responseLevel(v, 'bill-014', 'cli-moru').level).toBe('engage'); // moved, LJC in 7 days, but the client supports it
    expect(responseLevel(v, 'bill-008', 'cli-aster').level).toBe('engage'); // amend, but the subcommittee is 8 days out
  });

  it('responseLevel: an opposed, high-impact bill on an agenda within 7 days is act_now without a move; amend is not', () => {
    const v = view();
    expect(responseLevel(v, 'bill-018', 'cli-moru').level).toBe('act_now'); // oppose, high, subcommittee in 2 days, no move
    expect(responseLevel(v, 'bill-023', 'cli-wren').level).toBe('act_now'); // oppose, high, full committee in 3 days, no move
    expect(responseLevel(v, 'bill-028', 'cli-wren').level).toBe('engage'); // amend, high, subcommittee in 4 days, no move
    const s = freshStore();
    s.applyAction(principal, 'setClientPosition', { clientId: 'cli-moru', targetId: 'bill-018', stance: 'amend', rationale: 'Softer line' });
    expect(responseLevel(s.as(principal), 'bill-018', 'cli-moru').level).toBe('engage');
  });

  it('responseLevel: engage, monitor and watch follow the stated rules', () => {
    const v = view();
    const level = (b: string, c: string) => responseLevel(v, b, c).level;
    expect(level('bill-031', 'cli-aster')).toBe('engage'); // amend on its issue, LJC in 7 days
    expect(level('bill-003', 'cli-aster')).toBe('engage'); // no stance, but high impact and a meeting in 3 days
    expect(level('bill-002', 'cli-aster')).toBe('monitor'); // no stance, high impact, subcommittee in 10 days
    expect(level('bill-011', 'cli-aster')).toBe('monitor'); // supported, medium impact, meeting in 8 days
    expect(level('bill-004', 'cli-aster')).toBe('monitor'); // in legislative notice, nothing scheduled, high impact
    expect(level('bill-022', 'cli-moru')).toBe('watch'); // supported, medium impact, nothing moving
    expect(responseLevel(v, 'bill-009', 'cli-aster')).toEqual({ level: 'watch', reasons: ['Bill is closed (merged_alternative)'] });
    expect(level('bill-017', 'cli-moru')).toBe('watch'); // passed
  });

  it('responseLevel follows the client stance: support on the sidewalk bill drops it out of act_now', () => {
    const s = freshStore();
    s.applyAction(principal, 'setClientPosition', { clientId: 'cli-aster', targetId: 'bill-001', stance: 'support', rationale: 'Changed view' });
    const r = responseLevel(s.as(principal), 'bill-001', 'cli-aster');
    expect(r.level).toBe('engage'); // still high impact with a meeting in 3 days
    expect(r.reasons).toContain('Client stance: support');
  });

  it('responseLevel refuses a client the caller cannot see', () => {
    expect(() => responseLevel(freshStore().as(ctx('consultant', ['cli-aster'])), 'bill-013', 'cli-moru')).toThrow(/not accessible/);
  });

  it('keyPeople ranks the sponsor and the subcommittee chair with reasons', () => {
    const people = keyPeople(view(), 'bill-001');
    expect(people.find((p) => p.reasons.includes('Lead sponsor'))?.name).toBe('Baek Siwoo');
    expect(people.some((p) => p.reasons.some((r) => r.startsWith('Chair of Bill Review Subcommittee')))).toBe(true);
    expect(people.map((p) => p.score)).toEqual([...people.map((p) => p.score)].sort((a, b) => b - a));
  });

  it('upcomingDeadlines are dated, sorted, and include the committee vote, a task and the notice close', () => {
    const d = upcomingDeadlines(view(), 'cli-aster', 30);
    expect(d.map((x) => x.date)).toEqual([...d.map((x) => x.date)].sort());
    expect(d.some((x) => x.date === '2026-11-19' && x.billIds.includes('bill-001'))).toBe(true);
    expect(d.some((x) => x.kind === 'task')).toBe(true);
    expect(d.some((x) => x.date === '2026-12-07')).toBe(true);
  });

  it('issueExposure is sorted and capped at 100', () => {
    const e = issueExposure(view(), 'cli-aster');
    expect(e).toHaveLength(4);
    expect(e.map((x) => x.exposure)).toEqual([...e.map((x) => x.exposure)].sort((a, b) => b - a));
    expect(e.every((x) => x.exposure <= 100)).toBe(true);
  });
});
