// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Live public data: matching and merging rules, the multi-profile runner,
// public records in the ontology, and the committed snapshot the demo reads. Offline: fixtures only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupSameName } from '../ingest/connectors/assembly-bill-stages.ts';
import { mergeStories } from '../ingest/core/dedup.ts';
import { matchItem } from '../ingest/core/match.ts';
import { keep, runIngestMany } from '../ingest/core/runner.ts';
import { toOntology } from '../ingest/map.ts';
import { buildSnapshot, MAX_ITEMS } from '../ingest/snapshot.ts';
import type { LiveSnapshot } from '../ingest/snapshot.ts';
import { validateWorld } from '../ontology/validate.ts';
import { pilotMetrics } from '../ontology/functions.ts';
import type { Connector, MonitoringProfile, RawItem, ScoredItem } from '../ingest/core/types.ts';
import { ctx as role, freshStore, loadWorld } from './helpers.ts';

const fetchedAt = '2026-11-17T09:00:00.000Z';
const item = (over: Partial<RawItem>): RawItem => ({
  id: 'x:1', sourceId: 'x', sourceType: 'news', title: 't', url: 'https://www.example.org/1', publishedAt: '2026-11-10', fetchedAt, ...over,
});
const profile = (over: Partial<MonitoringProfile> = {}): MonitoringProfile => ({ clientId: 'cli-test', keywords: [], committees: [], agencies: [], ...over });

describe('matching and merging', () => {
  const p = { keywords: [{ term: '대체단백질', priority: 'medium' as const, synonyms: ['대체육'] }, { term: '배달로봇', priority: 'high' as const }, { term: 'EU', priority: 'low' as const }] };
  it('does not match across a word boundary that leaves one character', () => {
    expect(matchItem({ title: '국립순천대 체육관에서 결성식' }, p).matched).toEqual([]);
    expect(matchItem({ title: '대체육 시장' }, p).matched).toEqual(['대체단백질']);
    expect(matchItem({ title: '배달 로봇 보도 주행' }, p).matched).toEqual(['배달로봇']);
    expect(matchItem({ title: 'Neue Studie' }, p).matched).toEqual([]);
  });

  it('merges differently worded copies of one story, not stories that only share the search term', () => {
    const n = (i: number, title: string, date = '2026-11-16') => item({ id: `n:${i}`, url: `https://news.example.org/${i}`, title, institution: `outlet ${i}`, publishedAt: date });
    const merged = mergeStories([
      n(1, '토스뱅크, 블록체인 기반 해외송금 검증'),
      n(2, '토스뱅크, 솔라나와 블록체인 기반 해외송금 검증'),
      n(3, '토스뱅크, 솔라나로 해외송금 실험…USDC 전송 수십 초'),
      n(4, '재경부 "기본법 제정되면 스테이블코인 해외송금 규제 마련"', '2026-11-11'),
      n(5, '우리은행, 해외송금 심사에 AI 도입', '2026-11-05'),
      n(6, '해외송금 미리 쌓아 두는 돈 줄이려면', '2026-11-11'),
    ]);
    expect(merged.map((m) => m.title)).toEqual(['우리은행, 해외송금 심사에 AI 도입', '재경부 "기본법 제정되면 스테이블코인 해외송금 규제 마련"', '해외송금 미리 쌓아 두는 돈 줄이려면', '토스뱅크, 블록체인 기반 해외송금 검증']);
    expect(merged.at(-1)!.outlets).toEqual(['outlet 1', 'outlet 2', 'outlet 3']);
  });

  it('turns the same step for bills of the same name on one day into one item', () => {
    const s = (no: string) => item({ id: `s:${no}`, sourceType: 'bill', title: '[소관위 상정] 도로교통법 일부개정법률안', billNo: no, publishedAt: '2026-11-16' });
    const out = groupSameName([s('2201'), s('2202'), s('2203'), { ...s('2204'), title: '[소관위 상정] 지능형 로봇 개발 및 보급 촉진법 일부개정법률안' }]);
    expect(out.map((o) => o.title)).toEqual(['[소관위 상정] 도로교통법 일부개정법률안 (3건)', '[소관위 상정] 지능형 로봇 개발 및 보급 촉진법 일부개정법률안']);
    expect(out[0].excerpt).toBe('의안번호 2201, 2202, 2203');
  });
});

describe('committee scope', () => {
  it('keeps meetings of a watched committee when the agenda hits a keyword, or when no agenda is known, never budget sessions without a hit', () => {
    const p = profile({ committees: ['국토교통위원회'], keywords: [{ term: '자율주행', priority: 'medium' }] });
    const m = (title: string) => keep(item({ sourceType: 'minutes', committee: '국토교통위원회', title }), p);
    expect(m('[예정] 제8차 국토교통위원회 (2026.11.18.)')).toBeDefined();
    expect(m('[회의록 게재 전] 제2차 국토교통위원회 예산결산기금심사소위원회 (2026.11.17.)')).toBeUndefined();
    expect(m('국토교통위원회, 예산안 및 법률안 상정')).toBeDefined();
    expect(m('예산결산기금심사소위원회 자율주행 예산')).toBeDefined();
    const withAgenda = (matchText: string) => keep(item({ sourceType: 'minutes', committee: '국토교통위원회', title: '[예정] 제8차 국토교통위원회 (2026.11.18.)', matchText }), p);
    expect(withAgenda('항공안전법 일부개정법률안 3건')).toBeUndefined();
    expect(withAgenda('항공안전법 일부개정법률안 · 자율주행자동차법 일부개정법률안')).toBeDefined();
  });
});

describe('one fetch for several profiles', () => {
  it('calls each source once with the union of profiles and keeps items per profile', async () => {
    const calls: string[][] = [];
    const src: Connector = {
      id: 'src', label: 'src',
      fetch: async (c) => (calls.push(c.profile.committees), [
        item({ id: 'a', url: 'https://a.example.org/1', title: '배양육 기준', sourceType: 'news' }),
        item({ id: 'b', url: 'https://a.example.org/2', title: '제1차 정무위원회', sourceType: 'minutes', committee: '정무위원회' }),
      ]),
    };
    const moru = profile({ clientId: 'cli-moru', keywords: [{ term: '배양육', priority: 'high' }], committees: ['보건복지위원회'] });
    const wren = profile({ clientId: 'cli-wren', committees: ['정무위원회'] });
    const { fetched, byProfile } = await runIngestMany({ from: '2026-11-04', to: '2026-11-17' }, [moru, wren], [src]);
    expect(calls).toEqual([['보건복지위원회', '정무위원회']]);
    expect(fetched).toEqual([{ sourceId: 'src', label: 'src', ok: true, count: 2, kept: 0 }]);
    expect(byProfile.get('cli-moru')!.items.map((i) => i.id)).toEqual(['a']);
    expect(byProfile.get('cli-wren')!.items.map((i) => i.id)).toEqual(['b']);
  });
});

describe('public records in the ontology', () => {
  const world = loadWorld();
  const live = toOntology([
    item({ id: 'gwanbo:1', sourceId: 'gwanbo', sourceType: 'gazette', title: '국토교통부고시제2026-627호(규정 제정)', url: 'https://gwanbo.go.kr/ezpdf/customLayout.jsp?contentId=I1', institution: '국토교통부', excerpt: '관보 고시' }),
    item({ id: 'google-news:1', sourceId: 'google-news', title: '기사 제목', url: 'https://news.google.com/rss/articles/abc', institution: '연합뉴스', excerpt: '기사 본문 첫 문장' }),
  ]);
  const check = (objects = live) => validateWorld({ ...world, objects: [...world.objects, ...objects] });

  it('maps an item to a public Signal and Evidence only, and keeps no article text for news', () => {
    expect(live.map((o) => [o.type, o.provenance, o.synthetic])).toEqual([['Signal', 'public', false], ['Evidence', 'public', false], ['Signal', 'public', false], ['Evidence', 'public', false]]);
    expect(live[0]).toMatchObject({ sourceType: 'gazette', sourceName: 'Official Gazette', publisher: '국토교통부', publishedAt: '2026-11-10' });
    expect(live[2].rawText).toBe('기사 제목');
    expect(live[3].excerpt).toBe('기사 제목');
  });

  it('validates public Signals and Evidence alongside the fictional world', () => {
    expect(check()).toEqual([]);
  });

  it('refuses public provenance on anything else, synthetic urls on public records, and unflagged real records', () => {
    const person = { ...world.objects.find((o) => o.type === 'Person')!, provenance: 'public' as const, synthetic: false };
    expect(check([...live, person]).join('\n')).toMatch(/only Signal and Evidence may be public records/);
    expect(check([{ ...live[0], url: 'https://example.invalid/x' }]).join('\n')).toMatch(/official https url/);
    expect(check([{ ...live[0], synthetic: true }]).join('\n')).toMatch(/must have synthetic false/);
    expect(check([{ ...live[0], provenance: undefined }]).join('\n')).toMatch(/synthetic must be true/);
  });
});

describe('snapshot for the demo', () => {
  const scored = (id: string, date: string, over: Partial<RawItem> = {}): ScoredItem => ({ ...item({ id, url: `https://www.example.org/${id}`, publishedAt: date, ...over }), score: 1, matched: [] });

  it('keeps each client its latest items, caps the total, and records every source result', () => {
    const many = Array.from({ length: 150 }, (_, i) => scored(`n${i}`, `2026-11-${String(4 + (i % 14)).padStart(2, '0')}`));
    const snap = buildSnapshot({ from: '2026-11-04', to: '2026-11-17' }, fetchedAt,
      [{ sourceId: 'google-news', ok: true, count: 150 }, { sourceId: 'gwanbo', ok: false, count: 0, error: 'HTTP 503' }],
      new Map([['cli-a', many], ['cli-b', many.slice(0, 5)]]), new Map([['cli-a', { 'google-news': 150 }], ['cli-b', { 'google-news': 5 }]]));
    expect(snap.signals.length).toBe(75); // cli-a's latest 70 plus cli-b's five older ones
    expect(snap.signals.length).toBeLessThanOrEqual(MAX_ITEMS);
    expect(snap.signals.every((s) => s.type === 'Signal' && s.provenance === 'public')).toBe(true);
    expect(snap.sources).toEqual([
      { id: 'google-news', name: 'News', signalType: 'news', ok: true, fetched: 150, kept: { 'cli-a': 150, 'cli-b': 5 } },
      { id: 'gwanbo', name: 'Official Gazette', signalType: 'gazette', ok: false, fetched: 0, kept: { 'cli-a': 0, 'cli-b': 0 }, error: 'HTTP 503' },
    ]);
    expect(Object.values(snap.matches).flat().filter((c) => c === 'cli-b').length).toBeLessThanOrEqual(5);
  });

  const path = new URL('../data/live-snapshot.json', import.meta.url);
  it.runIf(existsSync(path))('the committed snapshot is small, public, validated, and keeps no article text', () => {
    const snap: LiveSnapshot = JSON.parse(readFileSync(path, 'utf8'));
    expect(snap.signals.length).toBeGreaterThan(0);
    expect(snap.signals.length).toBeLessThanOrEqual(MAX_ITEMS);
    expect(validateWorld({ ...loadWorld(), objects: [...loadWorld().objects, ...snap.signals] })).toEqual([]);
    for (const s of snap.signals) {
      expect(s.publishedAt >= snap.from).toBe(true);
      if (s.sourceType === 'news') expect(s.rawText).toBe(s.title);
      else expect(s.rawText.length).toBeLessThanOrEqual(s.title.length + 301);
      expect(snap.matches[s.id]?.length).toBeGreaterThan(0);
    }
    expect(snap.sources.length).toBe(11);
  });

  it('a trial uses the live fetch results for sources reached when they are supplied', () => {
    const view = freshStore().as(role('principal', ['cli-wren']));
    expect(pilotMetrics(view, 'pilot-wren-1').access).toEqual({ reached: 5, total: 5, rate: 1 });
    const m = pilotMetrics(view, 'pilot-wren-1', { bill_update: true, minutes: true, public_notice: false, press_release: true, news: true });
    expect(m.access).toEqual({ reached: 4, total: 5, rate: 0.8 });
    expect(m.bySource.find((r) => r.sourceType === 'public_notice')!.reached).toBe(false);
  });
});
