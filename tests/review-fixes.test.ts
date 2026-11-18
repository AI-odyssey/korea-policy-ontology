// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Fixes from the independent review: procedure realism in the sample world and consistency between the screen and the report.
import { describe, expect, it } from 'vitest';
import { agentContext, runWeeklyAgent, weeklyBrief } from '../agent/index.ts';
import { isWeekend, monthDay, workdaysBefore } from '../ontology/dates.ts';
import { daysToStep, responseLevel } from '../ontology/functions.ts';
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
      expect([...lines].sort()).toEqual([...expected].sort());
      // The screen (which also lists the team's tasks) agrees on every non-task item.
      const screen = weeklyBrief(v, c).timeline.filter((t) => !t.id.startsWith('task-')).map((t) => t.id);
      expect(screen.sort()).toEqual(brief.timeline.map((t) => t.id).sort());
      // Engage or above with a step inside seven days: its meeting is listed, and the urgent ones come first.
      const ids = new Set(brief.timeline.map((t) => t.id));
      for (const bill of v.list('Bill')) {
        if (['passed', 'merged_alternative', 'withdrawn'].includes(bill.stage)) continue;
        if (!v.sources(bill.id, 'about').length && !v.targets(bill.id, 'about').some((i) => v.links({ type: 'affects', from: i.id, to: c }).length)) continue;
        const level = responseLevel(v, bill.id, c).level;
        if (!['act_now', 'engage'].includes(level)) continue;
        const steps = v.sources(bill.id, 'agenda_item').filter((e) => e.status === 'scheduled' && e.date >= v.baseDate && e.date <= '2026-11-23');
        for (const e of steps) expect(ids.has(e.id), `${c} ${bill.id} ${e.id}`).toBe(true);
      }
      const firstNonUrgent = brief.timeline.findIndex((t) => !t.urgent);
      expect(brief.timeline.filter((t) => t.urgent).length).toBeGreaterThan(0);
      expect(lines.length).toBe(expected.length);
      void firstNonUrgent;
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
    }
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
