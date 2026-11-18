// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Fixes from the independent review: procedure realism in the sample world and consistency between the screen and the report.
import { describe, expect, it } from 'vitest';
import { agentContext, dueDateFor, runWeeklyAgent, TIMELINE_DAYS, weeklyBrief } from '../agent/index.ts';
import { addDays, isWeekend, monthDay, nextWorkday, workdaysBefore } from '../ontology/dates.ts';
import { daysToStep, responseLevel, stageGates, upcomingDeadlines } from '../ontology/functions.ts';
import { CLIENTS, freshStore, loadWorld, principal } from './helpers.ts';

const world = loadWorld();
const objs = (t: string) => world.objects.filter((o) => o.type === t);

describe('the weekly report lists what the screen lists', () => {
  it('Coming up has every dated item of the client-facing screen, and every bill at engage or above with a step within a week is on it', async () => {
    for (const c of CLIENTS) {
      const s = freshStore();
      const run = await runWeeklyAgent(s, { clientId: c });
      const v = s.as(agentContext(c));
      const brief = weeklyBrief(v, c, { clientFacing: true });
      const section = run.reportMarkdown!.split('## Coming up')[1].split('\n## ')[0];
      const lines = section.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.replace(/\[\^\d+\]/g, ''));
      const expected = brief.timeline.map((t) => `- ${monthDay(t.date)}: ${t.title} (${t.who}).`);
      expect(lines).toEqual(expected); // same items, same date order
      // The screen lists the same window; it adds only the team's own work and open decisions.
      const full = weeklyBrief(v, c).timeline;
      expect(full.filter((t) => !t.internal).map((t) => t.id)).toEqual(brief.timeline.map((t) => t.id));
      expect(full.map((t) => t.date)).toEqual([...full.map((t) => t.date)].sort());
      expect(full.every((t) => t.date <= addDays(v.baseDate, TIMELINE_DAYS))).toBe(true);
      // Nothing is cut: every dated item in the window is on the screen, and so is each open decision's due date.
      for (const d of upcomingDeadlines(v, c, TIMELINE_DAYS)) {
        const unlisted = d.kind === 'event' && d.billIds.length === 0 && v.get(d.objectId)!.kind !== 'hearing';
        if (!unlisted) expect(full.some((t) => t.id === d.objectId), `${c} ${d.title}`).toBe(true);
      }
      for (const d of v.list('Decision', (x) => x.clientId === c && x.status === 'open' && x.dueDate)) expect(full.some((t) => t.id === d.id), d.question).toBe(true);
      // Items due the day after the as-of date (the decision, the client's data) are in, not just later ones.
      expect(full.some((t) => t.date === nextWorkday(v.baseDate))).toBe(true);
      // Engage or above with a step inside seven days: its meeting is listed.
      const ids = new Set(brief.timeline.map((t) => t.id));
      for (const bill of v.list('Bill')) {
        if (['passed', 'merged_alternative', 'withdrawn'].includes(bill.stage)) continue;
        if (!v.sources(bill.id, 'about').length && !v.targets(bill.id, 'about').some((i) => v.links({ type: 'affects', from: i.id, to: c }).length)) continue;
        const level = responseLevel(v, bill.id, c).level;
        if (!['act_now', 'engage'].includes(level)) continue;
        const steps = v.sources(bill.id, 'agenda_item').filter((e) => e.status === 'scheduled' && e.date >= v.baseDate && e.date <= '2026-11-23');
        for (const e of steps) expect(ids.has(e.id), `${c} ${bill.id} ${e.id}`).toBe(true);
      }
      expect(brief.timeline.filter((t) => t.urgent).length).toBeGreaterThan(0);
    }
  });
});

describe('dates of a working week', () => {
  it('no meeting, task, interaction, notice close or decision falls on a weekend', async () => {
    const dated = [...objs('Event').filter((e) => e.kind !== 'seminar' || true).map((e) => ['event', e.id, e.date]), ...objs('Task').map((t) => ['task', t.id, t.dueDate]), ...objs('Interaction').map((i) => ['interaction', i.id, i.date])];
    expect(dated.filter(([, , d]) => isWeekend(String(d)))).toEqual([]);
    const s = freshStore();
    for (const c of CLIENTS) await runWeeklyAgent(s, { clientId: c });
    for (const d of s.as(principal).list('Decision', (x) => x.status === 'open' && x.dueDate)) expect(isWeekend(d.dueDate), d.question).toBe(false);
  });

  it('a decision is due at least a working day before the meeting it prepares for', async () => {
    const s = freshStore();
    for (const c of CLIENTS) await runWeeklyAgent(s, { clientId: c });
    const v = s.as(principal);
    for (const d of v.list('Decision', (x) => x.status === 'open' && x.targetId)) {
      const bill = v.get(d.subjectId)!;
      const meeting = v.sources(bill.id, 'agenda_item').filter((e) => e.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0];
      expect(d.dueDate <= workdaysBefore(meeting.date, 1) || d.dueDate === v.baseDate, d.question).toBe(true);
      expect(d.dueDate < meeting.date).toBe(true);
      // Never on the as-of date unless the meeting is too close for anything else.
      expect(d.dueDate >= nextWorkday(v.baseDate), d.question).toBe(true);
    }
  });

  it('dueDateFor leaves a working day to act, keeps a working day after the as-of date, and says today when the meeting is too close', () => {
    expect(dueDateFor('2026-11-16', '2026-11-19')).toBe('2026-11-17'); // two working days before
    expect(dueDateFor('2026-11-16', '2026-11-18')).toBe('2026-11-17'); // the day after the as-of date, still before the meeting
    expect(dueDateFor('2026-11-16', '2026-11-17')).toBe('2026-11-16'); // too close: due today
    expect(dueDateFor('2026-11-20', '2026-11-24')).toBe('2026-11-23'); // a Friday as-of date: the next working day is Monday
    expect(dueDateFor('2026-11-20', '2026-11-23')).toBe('2026-11-20'); // meeting on that Monday: due today
  });
});

describe('texts that touch the same article are not at different stages', () => {
  const SETTLED = ['committee_passed', 'lj_review', 'plenary_pending', 'passed'];
  const amended = (b: { id: string }) => world.links.filter((l) => l.type === 'amends' && l.from === b.id).map((l) => l.to);
  it('no passed or alternative text shares an article with a bill whose text is still open (a government bill in notice is folded in on submission)', () => {
    const bills = objs('Bill').filter((b) => !['merged_alternative', 'withdrawn', 'public_comment'].includes(b.stage));
    for (const a of bills.filter((b) => SETTLED.includes(b.stage))) {
      for (const b of bills.filter((x) => !SETTLED.includes(x.stage))) {
        const shared = amended(a).filter((p) => amended(b).includes(p));
        expect(shared, `${a.shortTitle} (${a.stage}) and ${b.shortTitle} (${b.stage})`).toEqual([]);
      }
    }
  });
});

describe('the stage list of a bill', () => {
  it('lists the sittings in date order and counts only sittings: a public hearing at the committee is not its meeting on the bill', () => {
    const v = freshStore().as(principal);
    for (const b of v.list('Bill')) {
      const dated = stageGates(v, b.id).filter((g) => g.status !== 'done' && g.date).map((g) => g.date!);
      expect(dated, b.shortTitle).toEqual([...dated].sort());
    }
    // Local presence bill: the hearing on Nov 17 is not a full committee stage; the subcommittee (Nov 20) is the next one.
    const gates = stageGates(v, 'bill-023');
    expect(gates.find((g) => g.key === 'subcommittee')).toMatchObject({ status: 'next', date: '2026-11-20' });
    expect(gates.find((g) => g.key === 'committee')).toMatchObject({ status: 'later', scheduled: false });
    expect(gates.find((g) => g.key === 'committee')!.date).toBeUndefined();
    expect(v.get('bill-023')!.stageHistory.at(-1)).toMatchObject({ stage: 'committee_review', date: '2026-11-12' });
  });
});

describe('dates and names in client texts', () => {
  const MONTH_DAY = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b/g;
  it('every date a stored text mentions is a date on record, and positions quote none (their rationale is copied into generated text)', () => {
    const known = new Set<string>();
    for (const o of world.objects) {
      for (const v of Object.values(o)) if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) known.add(monthDay(v));
      if (o.type === 'Bill') for (const h of o.stageHistory) known.add(monthDay(h.date));
    }
    for (const o of objs('ClientPosition')) expect(o.rationale.match(MONTH_DAY) ?? [], o.id).toEqual([]);
    for (const o of [...objs('Deliverable'), ...objs('RiskOpportunity'), ...objs('Decision')]) {
      for (const d of String(o.body ?? o.summary ?? o.question).match(MONTH_DAY) ?? []) expect(known.has(d), `${o.id}: ${d}`).toBe(true);
    }
  });
});

describe('who we meet', () => {
  it('the Strategy lists the person each open decision names, never the other secretary who can only delay, and the recommendation is a sentence', async () => {
    const s = freshStore();
    for (const c of CLIENTS) await runWeeklyAgent(s, { clientId: c });
    const v = s.as(principal);
    const subjects = (strategy: Record<string, any>): string[] => (strategy.targetIds as string[]).map((id) => v.get(id)!.subjectId);
    for (const d of v.list('Decision', (x) => x.status === 'open' && x.targetId)) {
      const issue = v.targets(d.subjectId, 'about')[0].id;
      expect(subjects(v.list('Strategy', (x) => x.clientId === d.clientId && x.issueId === issue)[0]), d.question).toContain(d.targetId);
      expect(d.recommendation).not.toMatch(/^Yes\b/);
    }
    expect(subjects(v.get('str-aster-01')!)).not.toContain('per-005');
  });
});

describe('government bills after the notice', () => {
  it('reach the Assembly months after the 40-day notice closes, and the notice closes on a working day', () => {
    for (const b of objs('Bill').filter((x) => x.billType === 'government' && x.stageHistory.length > 1)) {
      const [notice, submitted] = b.stageHistory;
      const closes = world.objects.find((e) => e.type === 'Event' && e.kind === 'public_comment' && e.startDate === notice.date)!;
      const gap = (Date.parse(submitted.date) - Date.parse(closes.date)) / 86_400_000;
      expect(gap, b.id).toBeGreaterThanOrEqual(60);
      expect(isWeekend(closes.date)).toBe(false);
    }
  });
});

describe('procedure in the sample world', () => {
  it('bills that amend the same article are reviewed together: no one of them passes its subcommittee alone', () => {
    const stage = (id: string) => objs('Bill').find((b) => b.id === id)!.stage;
    // Moru: the three lawmaker bills and the government bill on the same Food Sanitation Act articles leave the subcommittee together.
    expect(new Set(['bill-013', 'bill-014', 'bill-015', 'bill-016'].map(stage))).toEqual(new Set(['subcommittee_passed']));
    // Aster: only the sidewalk duties bill and the government bill (still in notice) touch Road Traffic Act Art. 8-2.
    const amends = (prov: string) => world.links.filter((l) => l.type === 'amends' && l.to === prov).map((l) => l.from).sort();
    expect(amends('prov-02')).toEqual(['bill-001', 'bill-004']);
    expect(amends('prov-06')).toEqual(['bill-002']);
    expect(amends('prov-12')).toEqual(['bill-003']);
  });

  it('no committee alternative at the Legislation and Judiciary Committee carries a stance that asks for substantive change', () => {
    const pos = objs('ClientPosition').find((p) => p.targetId === 'bill-031')!;
    expect(pos.stance).toBe('monitor');
    expect(pos.rationale).toMatch(/wording/);
    const ljc = world.links.filter((l) => l.type === 'agenda_item' && objs('Event').some((e) => e.id === l.from && e.institutionId === 'inst-ljc' && e.status === 'scheduled'));
    expect(ljc.length).toBeGreaterThan(0);
  });

  it('government bills delegate robot classes and standards to the enforcement decree', () => {
    expect(objs('Bill').find((b) => b.id === 'bill-004')!.summary).toMatch(/enforcement decree/);
  });

  it('one name for the committee everywhere', () => {
    const names = [...objs('Event').map((e) => e.name), ...objs('Signal').map((s) => s.title + s.rawText)].join('\n');
    expect(names).not.toMatch(/Trade and Industry/);
  });

  it('daysToStep still looks at every kind of step, the first 상정 included', () => {
    const v = freshStore().as(principal);
    const f = (id: string, c: string) => daysToStep(weeklyBrief(v, c).bills.find((r) => r.bill.id === id)!.facts);
    expect(f('bill-001', 'cli-aster')).toBe(3);
  });
});

describe('public records: precision', () => {
  it('a lone statute name, a committee-only match, a flagged phrase or an excluded outlet no longer keeps an item', async () => {
    const { keep } = await import('../ingest/core/runner.ts');
    const { readFileSync } = await import('node:fs');
    const profile = (n: string) => JSON.parse(readFileSync(new URL(`../ingest/profiles/${n}.json`, import.meta.url), 'utf8'));
    const item = (title: string, extra: object = {}) => ({ id: title, sourceId: 's', sourceType: 'news' as const, title, url: 'https://x.kr', publishedAt: '2026-11-10', fetchedAt: '2026-11-10T00:00:00Z', ...extra });
    expect(keep(item('도로교통법 일부개정법률안'), profile('aster-robotics'))).toBeUndefined();
    expect(keep(item('배송 로봇과 부딪히면 누가 배상하나, 실외이동로봇 논란'), profile('aster-robotics'))).toBeDefined();
    expect(keep(item('산자중기위, 소관 법률안 177건 상정', { sourceType: 'committee_press', committee: '산업통상자원중소벤처기업위원회' }), profile('aster-robotics'))).toBeUndefined();
    expect(keep(item('미틀리, 런던 이전…2027년 배양육 펫푸드 생산 확대'), profile('moru-foods'))).toBeUndefined();
    expect(keep(item('FinCEN의 해외송금 경보'), profile('wrenfield-pay'))).toBeUndefined();
    expect(keep(item('선불충전금 환급 안내', { institution: '법률신문' }), profile('wrenfield-pay'))).toBeUndefined();
    expect(keep(item('선불충전금 환급 안내', { institution: '한국경제' }), profile('wrenfield-pay'))).toBeDefined();
  });

  it('the committed snapshot already follows the profiles', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { refilterSnapshot } = await import('../ingest/refilter.ts');
    const dir = new URL('../ingest/profiles/', import.meta.url);
    const profiles = readdirSync(dir).map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
    const snap = JSON.parse(readFileSync(new URL('../data/live-snapshot.json', import.meta.url), 'utf8'));
    expect(refilterSnapshot(snap, profiles).dropped).toEqual([]);
  });
});
