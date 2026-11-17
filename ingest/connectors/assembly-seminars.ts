// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Seminars and forums held in the National Assembly. A schedule looks ahead, so the window runs to
// `to` + 14 days. Official API: 국회의원 세미나 일정 nfcoioopazrwmjrgs, latest date first.
import { assemblyRows } from './assembly-api.ts';
import { addDays, clip, inWindow, plain } from '../core/text.ts';
import type { Connector, FetchContext, RawItem } from '../core/types.ts';

export const SOURCE_ID = 'assembly-seminars';
export const LOOKAHEAD_DAYS = 14;

export function seminarItems(rows: Record<string, any>[], ctx: Pick<FetchContext, 'from' | 'to' | 'fetchedAt'>): RawItem[] {
  const until = addDays(ctx.to, LOOKAHEAD_DAYS);
  return rows
    .filter((r) => inWindow(r.SDATE, ctx.from, until))
    .map((r): RawItem => ({
      id: `${SOURCE_ID}:${r.SDATE}:${plain(r.TITLE)}`,
      sourceId: SOURCE_ID,
      sourceType: 'seminar',
      title: plain(r.TITLE),
      url: r.LINK,
      publishedAt: r.SDATE,
      institution: r.NAME ? plain(r.NAME) : undefined,
      excerpt: clip([`${r.SDATE} ${r.STIME ?? ''}`.trim(), r.LOCATION, r.NAME && `주최 ${plain(r.NAME)}`].filter(Boolean).join(' · ')),
      fetchedAt: ctx.fetchedAt,
    }));
}

export const assemblySeminars: Connector = {
  id: SOURCE_ID,
  label: '국회 세미나·토론회 일정',
  async fetch(ctx) {
    const rows = await assemblyRows('nfcoioopazrwmjrgs', {}, (rows) => rows.at(-1)!.SDATE < ctx.from);
    return seminarItems(rows, ctx);
  },
};
