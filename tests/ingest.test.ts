// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Offline tests for the ingest layer: parsers on recorded public fixtures, dedup, matching, runner, mapping.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { billItems } from '../ingest/connectors/assembly-bills.ts';
import { stageItems } from '../ingest/connectors/assembly-bill-stages.ts';
import { minutesItems } from '../ingest/connectors/assembly-minutes.ts';
import { seminarItems } from '../ingest/connectors/assembly-seminars.ts';
import { committeePressItems } from '../ingest/connectors/assembly-committee-press.ts';
import { committeeIn, monthsIn } from '../ingest/connectors/assembly-api.ts';
import { feedUrl, rssItems } from '../ingest/connectors/google-news.ts';
import { mergeStories, normTitle, sameStory, similarity } from '../ingest/core/dedup.ts';
import { matchItem } from '../ingest/core/match.ts';
import { keep, runIngest } from '../ingest/core/runner.ts';
import { toOntology } from '../ingest/map.ts';
import { checkProps } from '../ontology/props.ts';
import { objectTypes } from '../ontology/schema.ts';
import type { Connector, MonitoringProfile, RawItem } from '../ingest/core/types.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/ingest/${name}`, import.meta.url), 'utf8');
const api = JSON.parse(fixture('assembly.json'));
const ctx = { from: '2026-11-04', to: '2026-11-17', fetchedAt: '2026-11-17T09:00:00.000Z' };
const profile = (over: Partial<MonitoringProfile> = {}): MonitoringProfile => ({ clientId: 'cli-test', keywords: [], committees: [], agencies: [], ...over });
const item = (over: Partial<RawItem>): RawItem => ({
  id: 'x:1', sourceId: 'x', sourceType: 'news', title: 't', url: 'https://example.invalid/1', publishedAt: '2026-11-10', fetchedAt: ctx.fetchedAt, ...over,
});

describe('Assembly Open API parsers', () => {
  it('keeps bills proposed in the window and tells government bills apart', () => {
    const items = billItems(api.bills, ctx);
    expect(items.map((i) => i.billNo)).toEqual(['2222478', '2222101']);
    expect(items[0]).toMatchObject({ sourceType: 'gov_bill', committee: '행정안전위원회', publishedAt: '2026-11-05' });
    expect(items[1]).toMatchObject({ sourceType: 'bill', excerpt: '의원 10인 · 소관위 미회부' });
    expect(items[1].committee).toBeUndefined();
  });

  it('emits one item per stage date inside the window, with the result', () => {
    const items = stageItems(api.stages, ctx);
    expect(items.map((i) => i.title)).toEqual([
      '[소관위 상정] 지능형 로봇 개발 및 보급 촉진법 일부개정법률안',
      '[소관위 의결(대안반영폐기)] 도로교통법 일부개정법률안',
    ]);
    expect(items[1]).toMatchObject({ publishedAt: '2026-11-10', billNo: '2201000' });
  });

  it('groups minutes rows into one meeting per committee in the profile', () => {
    const items = minutesItems(api.minutes, { ...ctx, committees: ['산업통상자원중소벤처기업위원회'] });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('제6차 산업통상자원중소벤처기업위원회 (2026.11.09.)');
    expect(items[0].excerpt).toBe('1. 2027년도 예산안(의안번호 2221032) / 2. 2027년도 기금운용계획안(의안번호 2221033)');
  });

  it('looks 14 days past the window for seminars', () => {
    expect(seminarItems(api.seminars, ctx).map((i) => i.publishedAt)).toEqual(['2026-11-30']);
  });

  it('tags committee press releases with the committee their title names', () => {
    const items = committeePressItems(api.press, ctx);
    expect(items.map((i) => i.committee)).toEqual(['산업통상자원중소벤처기업위원회', '보건복지위원회', '법제사법위원회']);
    expect(items[2].title).toBe('법사위 예결소위, 법무부·대법원 등 6개 기관 예산안 의결');
    expect(committeeIn('국회 본회의 개최')).toBeUndefined();
  });

  it('lists the months a window touches', () => {
    expect(monthsIn('2026-10-28', '2026-12-02')).toEqual(['2026-10', '2026-11', '2026-12']);
  });
});

describe('news feed parser', () => {
  it('reads Google News RSS: outlet from <source>, title without the outlet, date in KST', () => {
    const items = rssItems(fixture('google-news.xml'), ctx.fetchedAt);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ title: '"사람이 먼저? 로봇이 먼저?"…배송 로봇과 부딪히면 누가 배상하나', institution: '조선일보', publishedAt: '2026-11-09' });
    expect(items[0].url.startsWith('https://news.google.com/rss/articles/')).toBe(true);
    expect(feedUrl('배양육', 14)).toBe('https://news.google.com/rss/search?q=%22%EB%B0%B0%EC%96%91%EC%9C%A1%22%20when%3A14d&hl=ko&gl=KR&ceid=KR:ko');
  });
});

describe('dedup', () => {
  it('measures similarity like difflib and normalizes titles', () => {
    expect(similarity('abcd', 'bcde')).toBeCloseTo(0.75);
    expect(normTitle('[단독] 배달로봇 (종합) 보도 주행 허용 - 연합뉴스')).toBe('배달로봇 보도 주행 허용');
  });

  it('merges the same story across outlets, keeping the earliest copy and every outlet', () => {
    const news = rssItems(fixture('google-news.xml'), ctx.fetchedAt);
    const merged = mergeStories(news);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ institution: '조선일보', outlets: ['조선일보', '다른신문'] });
    expect(sameStory(news[0].title, news[2].title)).toBe(false);
  });

  it('never merges different bills that share a title', () => {
    const a = item({ id: 'b:1', sourceType: 'bill', title: '도로교통법 일부개정법률안', url: 'https://example.invalid/a' });
    const b = item({ id: 'b:2', sourceType: 'bill', title: '도로교통법 일부개정법률안', url: 'https://example.invalid/b' });
    expect(mergeStories([a, b, { ...a }])).toHaveLength(2);
  });
});

describe('keyword matcher', () => {
  const p = profile({
    keywords: [
      { term: '실외이동로봇', priority: 'high', synonyms: ['배달로봇'] },
      { term: '도로교통법', priority: 'low', exclude: ['음주운전'] },
      { term: '로봇 보험', priority: 'medium' },
    ],
  });

  it('weights by priority, matches synonyms and ignores spaces', () => {
    expect(matchItem({ title: '배달 로봇 보도 주행, 로봇보험 의무화' }, p)).toEqual({ score: 5, matched: ['실외이동로봇', '로봇 보험'] });
  });

  it('drops a keyword when one of its exclude terms appears', () => {
    expect(matchItem({ title: '도로교통법 개정안', excerpt: '음주운전 처벌 강화' }, p)).toEqual({ score: 0, matched: [] });
    expect(matchItem({ title: '도로교통법 일부개정법률안' }, p).score).toBe(1);
  });
});

describe('runner', () => {
  it('keeps keyword matches, committee-scoped minutes and watched bills; reports failing sources', async () => {
    const p = profile({ keywords: [{ term: '배양육', priority: 'high' }], committees: ['보건복지위원회'], watchBills: ['2299999'] });
    const ok: Connector = {
      id: 'ok', label: 'ok', fetch: async () => [
        item({ id: 'ok:1', title: '배양육 기준 마련', url: 'https://example.invalid/1' }),
        item({ id: 'ok:2', title: '무관한 기사', url: 'https://example.invalid/2' }),
        item({ id: 'ok:3', sourceType: 'minutes', committee: '보건복지위원회 예산결산기금심사소위원회', title: '회의', url: 'https://example.invalid/3' }),
        item({ id: 'ok:4', sourceType: 'bill', billNo: '2299999', title: '[소관위 상정] 어느 법률안', url: 'https://example.invalid/4' }),
      ],
    };
    const broken: Connector = { id: 'broken', label: 'broken', fetch: async () => { throw new Error('HTTP 503 from example.invalid'); } };
    const { items, perSource } = await runIngest({ from: ctx.from, to: ctx.to }, p, [ok, broken]);
    expect(items.map((i) => i.id)).toEqual(['ok:1', 'ok:3', 'ok:4']);
    expect(perSource).toEqual([
      { sourceId: 'ok', label: 'ok', ok: true, count: 4, kept: 3 },
      { sourceId: 'broken', label: 'broken', ok: false, count: 0, kept: 0, error: 'HTTP 503 from example.invalid' },
    ]);
    expect(keep(item({ sourceType: 'news', committee: '보건복지위원회' }), p)).toBeUndefined(); // scope applies to minutes and press only
  });

  it('runs only the sources a profile names', async () => {
    const c = (id: string): Connector => ({ id, label: id, fetch: async () => [] });
    const { perSource } = await runIngest({ from: ctx.from, to: ctx.to }, profile({ sources: ['b'] }), [c('a'), c('b')]);
    expect(perSource.map((s) => s.sourceId)).toEqual(['b']);
  });
});

describe('mapping to the ontology', () => {
  it('produces a new Signal and a rule Evidence that satisfy the schema, with stable ids', () => {
    const [bill] = billItems(api.bills, ctx);
    const objects = toOntology([bill]);
    expect(objects.map((o) => o.type)).toEqual(['Signal', 'Evidence']);
    const [signal, evidence] = objects;
    const typeOf = (id: string) => objects.find((o) => o.id === id)?.type;
    const props = ({ id, type, markings, synthetic, provenance, ...rest }: Record<string, unknown>) => rest;
    expect(checkProps(objectTypes.Signal.properties, props(signal), typeOf)).toEqual([]);
    expect(checkProps(objectTypes.Evidence.properties, props(evidence), typeOf)).toEqual([]);
    expect(signal).toMatchObject({ sourceType: 'bill_update', status: 'new', url: bill.url, synthetic: false, provenance: 'public', markings: ['PUBLIC'] });
    expect(evidence).toMatchObject({ method: 'rule', sourceUrl: bill.url, signalId: signal.id });
    expect(toOntology([bill])[0].id).toBe(signal.id);
  });
});
