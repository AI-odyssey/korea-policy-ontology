// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// The screens, the weekly report and the assistant must say the same thing about the same data: per-client queues,
// citations that point at the record a sentence names, a report that follows later approvals, and decisions that
// notice when their premise changes.
import { describe, expect, it } from 'vitest';
import { confirmedSignals, monthDay, responseFacts, responseLevel, signalQueue } from '../ontology/index.ts';
import type { ObjectRecord, Store } from '../ontology/index.ts';
import {
  agentContext, buildReport, decisionStale, moves, proposeTriage, refreshWeeklyReport, regenerateDecision, reportTitle,
  runWeeklyAgent, stopLine, triageParams, weeklyBrief,
} from '../agent/index.ts';
import { openWeek } from '../agent/opening.ts';
import { why } from '../ingest/snapshot.ts';
import { CLIENTS, ctx, freshStore, principal } from './helpers.ts';

const lead = (c: string) => ctx('principal', [c]);
const firstStep = (s: Store, c: string) => runWeeklyAgent(s, { clientId: c, applyTriage: true }).then((r) => r.steps[0].output);

describe('triage is kept per client', () => {
  it('every client sees the same new items for the same week, whichever assistant ran first', async () => {
    const counts = await Promise.all(CLIENTS.map((c) => firstStep(freshStore(), c)));
    const s = freshStore();
    const inTurn: string[] = [];
    for (const c of CLIENTS) inTurn.push(await firstStep(s, c));
    expect(inTurn).toEqual(counts);
    expect(new Set(counts).size).toBe(1);
  });

  it("one client's run never edits the public Signal or another client's queue", async () => {
    const s = freshStore();
    const before = signalQueue(s.as(lead('cli-moru'))).map((x) => x.id);
    const signals = JSON.stringify(s.as(principal).list('Signal'));
    await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    expect(JSON.stringify(s.as(principal).list('Signal'))).toBe(signals);
    expect(signalQueue(s.as(lead('cli-moru'))).map((x) => x.id)).toEqual(before);
    expect(signalQueue(s.as(lead('cli-aster'))).length).toBeLessThan(before.length);
    expect(s.as(lead('cli-moru')).list('SignalTriage')).toEqual([]); // Aster's filings are in Aster's layer
  });
});

describe('citations point at the record the sentence names', () => {
  it('the headline cites the notice for the meeting it names, for every client', async () => {
    const s = freshStore();
    const runs = await openWeek(s, CLIENTS);
    for (const c of CLIENTS) {
      const v = s.as(lead(c));
      const top = weeklyBrief(v, c).bills[0];
      const meeting = top.facts.slot!;
      const md = runs[c].reportMarkdown!;
      const [, n] = md.split('\n')[2].match(/\[\^(\d+)\]$/)!;
      const note = md.split('\n').find((l) => l.startsWith(`[^${n}]:`))!;
      expect(note, c).toContain(`Notice: ${meeting.name}, ${monthDay(meeting.date)}`);
      // The decision on the same bill names the same notice as its source.
      const d = v.list('Decision', (x) => x.subjectId === top.bill.id && x.status === 'open')[0];
      const src = v.get(v.links({ type: 'raised_by', from: d.id })[0].to)!;
      expect(src.title, c).toBe(`Notice: ${meeting.name}, ${monthDay(meeting.date)}`);
    }
  });

  it("a remark is a person's move only in a record where that person is the subject or the speaker", async () => {
    const s = freshStore();
    await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const v = s.as(lead('cli-aster'));
    for (const m of moves(v, 'cli-aster', '2026-11-09')) {
      const src = m.sourceId ? v.get(m.sourceId) : undefined;
      if (src?.type === 'Signal') expect(src.title.includes(m.subject.name) || src.sourceType === 'minutes', `${m.subject.name} in ${src.title}`).toBe(true);
    }
    // Seo Haeun is quoted inside a union news story this week; that is not her move.
    expect(moves(v, 'cli-aster', '2026-11-09').some((m) => m.subject.name === 'Seo Haeun')).toBe(false);
  });

  it('a stakeholder move always says what was said or done', async () => {
    const s = freshStore();
    await openWeek(s, CLIENTS);
    for (const c of CLIENTS) {
      for (const m of moves(s.as(lead(c)), c, '2026-11-09')) expect(m.text, c).not.toMatch(/^Spoke at/);
    }
    const moru = moves(s.as(lead('cli-moru')), 'cli-moru', '2026-11-09');
    expect(moru.find((m) => m.subject.name === 'Oh Yeeun')?.text).toMatch(/review deadline/);
  });

  it('items still waiting to be confirmed feed no move, report line or source', async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-wren', applyTriage: true });
    const v = s.as(lead('cli-wren'));
    const unsure = run.proposals.filter((p) => p.action === 'link' && p.relevantToClient && p.confidence < 0.8).map((p) => p.signalId);
    expect(unsure.length).toBeGreaterThan(0);
    const confirmed = new Set(confirmedSignals(v).map((x) => x.id));
    for (const id of unsure) {
      expect(confirmed.has(id)).toBe(false);
      expect(run.reportMarkdown).not.toContain(`obj:${id})`);
    }
    for (const m of moves(v, 'cli-wren', '2026-11-09')) expect(unsure).not.toContain(m.sourceId);
  });
});

describe('the weekly report follows later approvals', () => {
  it('an approved risk enters the report before it is approved and sent', async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const c = lead('cli-aster');
    const risk = s.pendingApprovals(c).find((p) => p.action === 'addRiskOpportunity')!;
    s.approve(c, risk.id);
    expect(refreshWeeklyReport(s, agentContext('cli-aster'), 'cli-aster')).toBe(true);
    const report = s.as(c).get(run.deliverableId!)!;
    expect(report.body).toContain(String(risk.params.title));
    expect(refreshWeeklyReport(s, agentContext('cli-aster'), 'cli-aster')).toBe(false); // nothing new
  });

  it('a report approved before the risk goes back to review instead of being sent stale', async () => {
    const s = freshStore();
    const run = await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const c = lead('cli-aster');
    s.applyAction(c, 'approveDeliverable', { deliverableId: run.deliverableId! });
    s.approve(c, s.pendingApprovals(c).find((p) => p.action === 'addRiskOpportunity')!.id);
    refreshWeeklyReport(s, agentContext('cli-aster'), 'cli-aster');
    expect(s.as(c).get(run.deliverableId!)).toMatchObject({ status: 'in_review' });
    expect(() => s.applyAction(c, 'sendDeliverable', { deliverableId: run.deliverableId! })).toThrow(/approves/);
    s.applyAction(c, 'approveDeliverable', { deliverableId: run.deliverableId! });
    s.applyAction(c, 'sendDeliverable', { deliverableId: run.deliverableId! });
    const sent = s.as(c).get(run.deliverableId!)!;
    expect(sent.body).toBe(buildReport(s.as(c), 'cli-aster', weeklyBrief(s.as(c), 'cli-aster', { clientFacing: true }), reportTitle(s.baseDate)).body);
  });
});

describe('decisions notice when their premise changes', () => {
  it('a new stance marks the decision out of date, and regenerating withdraws it', async () => {
    const s = freshStore();
    await runWeeklyAgent(s, { clientId: 'cli-wren', applyTriage: true });
    const c = lead('cli-wren');
    const d = s.as(c).list('Decision', (x) => x.status === 'open' && x.targetId === 'per-015')[0];
    expect(d.recommendation).toMatch(/has not taken a public position/);
    expect(decisionStale(s.as(c), d)).toBeUndefined();
    s.applyAction(c, 'assessStakeholder', { clientId: 'cli-wren', subjectId: 'per-015', issueId: 'iss-08', stance: 'supportive', influence: 'high', relevance: 'high', basisIds: s.as(c).list('Event', (e) => e.name === 'Public hearing on foreign payment providers').map((e) => e.id) });
    expect(decisionStale(s.as(c), s.as(c).get(d.id)!)).toBe('stance changed');
    regenerateDecision(s, c, d.id);
    const after = s.as(c);
    expect(after.get(d.id)).toMatchObject({ status: 'resolved', resolution: 'withdraw' });
    // Nobody else on the agenda needs persuading, and no open decision still says she has no position.
    expect(after.list('Decision', (x) => x.status === 'open' && /Go Mirae/.test(x.question))).toEqual([]);
  });

  it('approving a decision files a short follow-up task', async () => {
    const s = freshStore();
    await runWeeklyAgent(s, { clientId: 'cli-aster', applyTriage: true });
    const c = lead('cli-aster');
    const d = s.as(c).list('Decision', (x) => x.status === 'open')[0];
    const res = s.applyAction(c, 'resolveDecision', { decisionId: d.id, resolution: 'approve' });
    const task = s.as(c).get(res.created[0])!;
    expect(task.title).toBe('Meet Jang Sora before the Nov 19 full committee');
  });
});

describe('response level counts an open notice period as a step', () => {
  it('the sidewalk operation standards bill shows its notice deadline and rises once the client wants it amended', () => {
    const s = freshStore();
    const v = s.as(principal);
    const f = responseFacts(v, 'bill-004', 'cli-aster');
    expect(f.notice?.date).toBe('2026-12-07');
    const r = responseLevel(v, 'bill-004', 'cli-aster');
    expect(r.level).toBe('monitor'); // high impact and a step within 30 days, but no client position yet
    expect(r.reasons).toContain('Notice period closes on 2026-12-07 (21 days)');
    s.applyAction(principal, 'setClientPosition', { clientId: 'cli-aster', targetId: 'bill-004', stance: 'amend', rationale: 'Cargo class' });
    expect(responseLevel(s.as(principal), 'bill-004', 'cli-aster').level).toBe('engage');
  });
});

describe('assistant run text', () => {
  it('every step starts with a capital letter and agrees in number', async () => {
    const s = freshStore();
    const runs = await openWeek(s, CLIENTS);
    for (const r of Object.values(runs)) {
      for (const step of r.steps) {
        expect(step.output, step.name).toMatch(/^[A-Z0-9]/);
        expect(step.output).not.toMatch(/\bOne (item|decision) wait\b|\b(?:[2-9]|Two|Three|Four|Five) items waits\b/);
      }
    }
    expect(stopLine([{ action: 'approveDeliverable', by: 'principal', objectId: 'd', reason: '' }])).toBe('Stopped. The weekly report waits for your approval. The assistant cannot approve or send.');
    expect(stopLine([])).toBe('Stopped. Nothing waits for you.');
  });
});

describe('public records show why they matched', () => {
  it('a long agenda shows only the line with the keyword', () => {
    const item = {
      id: 'x', sourceId: 'assembly-minutes', sourceType: 'minutes' as const, title: '제3차 정무위원회 법안심사제1소위원회', url: 'https://www.assembly.go.kr/x',
      publishedAt: '2026-11-16', fetchedAt: '2026-11-16T00:00:00Z', committee: '정무위원회', score: 3, matched: ['전자금융거래법'],
      excerpt: '예금자보호법 일부개정법률안 · 자본시장과 금융투자업에 관한 법률 일부개정법률안 17건 · 전자금융거래법 일부개정법률안 2건 · 신용보증기금법 일부개정법률안',
    };
    expect(why(item, () => [])).toEqual({ terms: ['전자금융거래법'], line: '전자금융거래법 일부개정법률안 2건' });
    expect(why({ ...item, matched: [] }, () => [])).toEqual({ terms: [], committee: '정무위원회' });
  });
});

describe('fictional history matches the records', () => {
  it("Wrenfield's must-catch items name the bill their caught record is about", () => {
    const v = freshStore().as(lead('cli-wren'));
    const pilot = v.get('pilot-wren-1')!;
    for (const e of pilot.expected as { title: string; url?: string }[]) {
      const sig = (pilot.caught as { signalId: string }[]).map((c) => v.get(c.signalId)!).find((x) => x.url === e.url);
      if (!sig) continue;
      const bill = v.list('Bill').find((b: ObjectRecord) => b.billNo && sig.rawText.includes(b.billNo));
      if (!bill) continue;
      // A title that names a bill by its working name must name the bill the record is about.
      const named = v.list('Bill').filter((b) => e.title.toLowerCase().includes(String(b.shortTitle).toLowerCase().replace(/ bill$/, '')));
      for (const b of named) expect(b.id, e.title).toBe(bill.id);
    }
  });
});

// proposeTriage and triageParams stay usable for a person confirming one item for one client.
it('a person confirming an item files it for the viewed client only', () => {
  const s = freshStore();
  const v = s.as(lead('cli-aster'));
  const sig = signalQueue(v).find((x) => proposeTriage(v, x, 'cli-aster').relevantToClient)!;
  s.applyAction(lead('cli-aster'), 'triageSignal', triageParams(proposeTriage(v, sig, 'cli-aster'), 'cli-aster'));
  expect(signalQueue(s.as(lead('cli-aster'))).map((x) => x.id)).not.toContain(sig.id);
  expect(signalQueue(s.as(lead('cli-wren'))).map((x) => x.id)).toContain(sig.id);
});
