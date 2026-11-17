// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { describe, expect, it } from 'vitest';
import { actionTypes } from '../ontology/schema.ts';
import { ingestProfile, pilotMetrics, profileMatch } from '../ontology/functions.ts';
import { proposeTriage } from '../agent/triage.ts';
import { agentContext, runWeeklyAgent } from '../agent/index.ts';
import { asterConsultant, codeOf, ctx, freshStore, principal } from './helpers.ts';

const wrenLead = ctx('principal', ['cli-wren'], 'principal-1');
const wrenConsultant = ctx('consultant', ['cli-wren'], 'consultant-wren-1');
const kw = [{ term: 'remittance', priority: 'high' }];

describe('monitoring settings: permissions and approval', () => {
  it('only people change settings and run trials; consultant setting changes wait for the engagement lead', () => {
    for (const a of ['updateMonitoringProfile', 'startPilot', 'setPilotCriteria', 'addExpectedItem', 'markRelevance', 'closePilot'] as const) {
      expect(actionTypes[a].allowedRoles).toEqual(['consultant', 'principal']);
    }
    expect(actionTypes.updateMonitoringProfile).toMatchObject({ requiresApproval: true, approverRole: 'principal' });
    const s = freshStore();
    expect(codeOf(() => s.applyAction(agentContext('cli-wren'), 'updateMonitoringProfile', { clientId: 'cli-wren', keywords: kw }))).toBe('PERMISSION_DENIED');

    const r = s.applyAction(wrenConsultant, 'updateMonitoringProfile', { clientId: 'cli-wren', keywords: kw });
    expect(r.status).toBe('pending_approval');
    expect(s.as(wrenLead).get('mp-wren')!.keywords).toHaveLength(6); // unchanged until approved
    s.approve(wrenLead, r.pendingId!);
    expect(s.as(wrenLead).get('mp-wren')).toMatchObject({ keywords: kw, updatedBy: 'consultant-wren-1', approvedBy: 'principal-1' });

    s.applyAction(wrenLead, 'updateMonitoringProfile', { clientId: 'cli-wren', sources: ['bill_update'] });
    const log = s.auditEntries(wrenLead).filter((a) => a.action === 'updateMonitoringProfile').map((a) => [a.role, a.status]);
    expect(log).toEqual([['agent', 'denied'], ['consultant', 'pending_approval'], ['consultant', 'executed'], ['principal', 'executed']]);
  });

  it('rejects malformed settings', () => {
    const s = freshStore();
    const bad = (p: Record<string, unknown>) => codeOf(() => s.applyAction(wrenLead, 'updateMonitoringProfile', { clientId: 'cli-wren', ...p }));
    expect(bad({ objectives: [{ text: 'x', priority: 4 }] })).toBe('INVALID_PARAMS');
    expect(bad({ keywords: [{ term: 'a', priority: 'urgent' }] })).toBe('INVALID_PARAMS');
    expect(bad({ keywords: [{ term: 'a', priority: 'high' }, { term: 'A', priority: 'low' }] })).toBe('INVALID_PARAMS');
    expect(bad({ committees: ['inst-fsc'] })).toBe('INVALID_PARAMS'); // an agency is not a committee
    expect(bad({ sources: ['tv'] })).toBe('INVALID_PARAMS');
  });

  it('serializes to the collector input shape', () => {
    expect(Object.keys(ingestProfile(freshStore().as(principal).get('mp-wren')!))).toEqual(['clientId', 'keywords', 'committees', 'agencies', 'sources']);
  });
});

describe('isolation', () => {
  it("one client's settings and trial are invisible to another client and cannot be written from its workspace", () => {
    const s = freshStore();
    const aster = s.as(asterConsultant);
    expect(aster.get('mp-wren')).toBeUndefined();
    expect(aster.get('pilot-wren-1')).toBeUndefined();
    expect(aster.list('MonitoringProfile').map((p) => p.id)).toEqual(['mp-aster']);
    expect(aster.list('PilotEvaluation')).toEqual([]);
    expect(() => pilotMetrics(aster, 'pilot-wren-1')).toThrow(/not accessible/);
    expect(codeOf(() => s.applyAction(asterConsultant, 'markRelevance', { pilotId: 'pilot-wren-1', signalId: 'sig-041', relevance: 'relevant' }))).toBe('INVALID_PARAMS');
    expect(codeOf(() => s.applyAction(asterConsultant, 'updateMonitoringProfile', { clientId: 'cli-wren', keywords: kw }))).toBe('INVALID_PARAMS');
    s.applyAction(wrenLead, 'markRelevance', { pilotId: 'pilot-wren-1', signalId: 'sig-027', relevance: 'relevant' });
    expect(s.auditEntries(asterConsultant).some((a) => a.action === 'markRelevance' && a.status === 'executed')).toBe(false);
  });
});

describe('pilotMetrics on the seeded Wrenfield Pay trial', () => {
  it('passes on access and noise, fails on Assembly and government misses', () => {
    const m = pilotMetrics(freshStore().as(wrenLead), 'pilot-wren-1');
    expect(m.access).toEqual({ reached: 5, total: 5, rate: 1 });
    expect([m.expected, m.found, m.missed.length, m.officialMisses, m.missRate]).toEqual([12, 9, 3, 2, 0.25]);
    expect(m.missed.map((e) => e.sourceType)).toEqual(['press_release', 'public_notice', 'news']);
    expect([m.caught, m.judged, m.irrelevant, m.unreviewed, m.noiseRate]).toEqual([15, 13, 2, 2, 0.154]);
    expect(m.lagMedianDays).toBe(1);
    expect(m.matches.map((x) => x.signalId)).toEqual(['sig-020', 'sig-021', 'sig-022', 'sig-034', 'sig-039', 'sig-043', 'sig-047', 'sig-059', 'sig-062']);
    expect(m.checks).toEqual({ access: true, misses: false, noise: true });
    expect(m.pass).toBe(false);
    expect(m.bySource.map((r) => [r.sourceType, r.expected, r.missed, r.caught, r.irrelevant])).toEqual([
      ['bill_update', 4, 0, 4, 0], ['press_release', 3, 1, 2, 0], ['public_notice', 2, 1, 1, 0], ['news', 2, 1, 6, 2], ['minutes', 1, 0, 2, 0],
    ]);
  });

  it('client feedback, a new must-catch item and new targets move the numbers; closing records the result', () => {
    const s = freshStore();
    const id = 'pilot-wren-1';
    s.applyAction(wrenLead, 'markRelevance', { pilotId: id, signalId: 'sig-027', relevance: 'irrelevant' });
    expect(pilotMetrics(s.as(wrenLead), id)).toMatchObject({ judged: 14, irrelevant: 3, noiseRate: 0.214, checks: { noise: false } });
    s.applyAction(wrenLead, 'addExpectedItem', { pilotId: id, title: byTitle(s, 'sig-054'), date: '2026-10-23', sourceType: 'news' });
    expect(pilotMetrics(s.as(wrenLead), id)).toMatchObject({ expected: 13, found: 10 });
    expect(codeOf(() => s.applyAction(wrenLead, 'addExpectedItem', { pilotId: id, title: 'Late item', date: '2026-11-01', sourceType: 'news' }))).toBe('INVALID_PARAMS');
    expect(codeOf(() => s.applyAction(wrenLead, 'markRelevance', { pilotId: id, signalId: 'sig-001', relevance: 'relevant' }))).toBe('INVALID_PARAMS');
    s.applyAction(wrenLead, 'setPilotCriteria', { pilotId: id, officialMisses: 2, noise: 0.25 });
    expect(pilotMetrics(s.as(wrenLead), id).pass).toBe(true);
    s.applyAction(wrenConsultant, 'closePilot', { pilotId: id });
    expect(s.as(wrenLead).get(id)).toMatchObject({ status: 'closed', result: 'pass', closedBy: 'consultant-wren-1' });
    expect(codeOf(() => s.applyAction(wrenLead, 'markRelevance', { pilotId: id, signalId: 'sig-027', relevance: 'relevant' }))).toBe('PRECONDITION_FAILED');
  });

  it('startPilot records what the profile catches in the window, one open trial at a time', () => {
    const s = freshStore();
    expect(codeOf(() => s.applyAction(wrenLead, 'startPilot', { clientId: 'cli-wren', title: 'Second', from: '2026-11-02', to: '2026-11-15' }))).toBe('INVALID_PARAMS');
    const aster = ctx('principal', ['cli-aster'], 'principal-1');
    expect(codeOf(() => s.applyAction(aster, 'startPilot', { clientId: 'cli-aster', title: 'Late', from: '2026-11-10', to: '2026-11-20' }))).toBe('INVALID_PARAMS');
    const [pid] = s.applyAction(aster, 'startPilot', { clientId: 'cli-aster', title: 'Trial', from: '2026-11-02', to: '2026-11-15' }).created;
    const p = s.as(aster).get(pid)!;
    expect(p).toMatchObject({ status: 'open', criteria: { access: 1, officialMisses: 0, noise: 0.2 }, expected: [] });
    expect(p.caught.length).toBeGreaterThan(0);
    const m = pilotMetrics(s.as(aster), pid);
    expect(m).toMatchObject({ expected: 0, missed: [], judged: 0, noiseRate: 0, lagMedianDays: null });
  });
});

const byTitle = (s: ReturnType<typeof freshStore>, id: string) => s.as(principal).get(id)!.title as string;

describe('profileMatch', () => {
  const profile = { keywords: [
    { term: 'remittance', priority: 'high' as const, synonyms: ['money transfer'] },
    { term: 'prepaid', priority: 'medium' as const, exclude: ['bank branch'] },
    { term: 'foreign exchange', priority: 'low' as const },
  ] };

  it('weighs hits by priority and matches synonyms case-insensitively', () => {
    expect(profileMatch(profile, 'Remittance limits rise').score).toBe(0.6);
    expect(profileMatch(profile, 'A new MONEY TRANSFER cap').hits).toEqual([{ term: 'remittance', priority: 'high', via: 'money transfer' }]);
    expect(profileMatch(profile, 'prepaid balances').score).toBe(0.45);
    expect(profileMatch(profile, 'foreign exchange reporting').score).toBe(0.3);
    expect(profileMatch(profile, 'remittance and foreign exchange').score).toBe(0.72); // 1 - 0.4 * 0.7
    expect(profileMatch(profile, 'Weather advisory').score).toBe(0);
  });

  it('an exclude phrase suppresses its term only', () => {
    const m = profileMatch(profile, 'Bank branch closures leave prepaid card users stuck; remittance offices stay open');
    expect(m.suppressed).toEqual([{ term: 'prepaid', exclude: 'bank branch' }]);
    expect(m.hits.map((h) => h.term)).toEqual(['remittance']);
  });
});

describe('triage reads the client profile', () => {
  it('an exclude in the Aster profile keeps the sidewalk repaving item away from Aster', () => {
    const v = freshStore().as(ctx('principal', ['cli-aster'], 'principal-1'));
    const repave = v.list('Signal', (x) => /repaving/.test(x.title))[0];
    const p = proposeTriage(v, repave, 'cli-aster');
    expect(p).toMatchObject({ action: 'link', issueId: 'iss-01', relevantToClient: false, suppressed: ['sidewalk'] });
  });

  it('a high-priority keyword raises relevance, and dropping it from the profile lowers it', () => {
    const s = freshStore();
    const lead = ctx('principal', ['cli-wren'], 'principal-1');
    const sig = s.as(lead).list('Signal', (x) => x.status === 'new' && /annual transfer limit/.test(x.title))[0];
    const before = proposeTriage(s.as(lead), sig, 'cli-wren');
    expect(before.matched).toContain('remittance');
    s.applyAction(lead, 'updateMonitoringProfile', { clientId: 'cli-wren', keywords: [{ term: 'remittance', priority: 'low' }] });
    const after = proposeTriage(s.as(lead), sig, 'cli-wren');
    expect(after.relevance).toBeLessThan(before.relevance);
    s.applyAction(lead, 'updateMonitoringProfile', { clientId: 'cli-wren', keywords: [{ term: 'payments', priority: 'high', exclude: ['transfer limit'] }] });
    expect(proposeTriage(s.as(lead), sig, 'cli-wren').relevantToClient).toBe(false);
  });

  it('keeps the Aster story: the sidewalk bill files itself and the decision is to meet Jang Sora', async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const hero = run.proposals.find((p) => p.billId === 'bill-001')!;
    expect(hero).toMatchObject({ action: 'link', issueId: 'iss-01', relevantToClient: true });
    expect(hero.confidence).toBeGreaterThanOrEqual(0.8);
    expect(run.appliedTriage).toContain(hero.signalId);
    expect(s.as(principal).get(run.decisionId!)!.question).toMatch(/^Meet Jang Sora, /);
  });
});
