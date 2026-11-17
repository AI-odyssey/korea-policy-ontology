// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Standing committee and subcommittee meeting minutes for the profile's committees, one item per meeting
// with its agenda as the excerpt. Official API: 위원회 회의록 ncwgseseafwbuheph (one row per agenda item).
import { ASSEMBLY_AGE, assemblyRows, monthsIn } from './assembly-api.ts';
import { clip, inWindow } from '../core/text.ts';
import type { Connector, FetchContext, RawItem } from '../core/types.ts';

export const SOURCE_ID = 'assembly-minutes';

export function minutesItems(rows: Record<string, any>[], ctx: Pick<FetchContext, 'from' | 'to' | 'fetchedAt'> & { committees: string[] }): RawItem[] {
  const meetings = new Map<string, { row: Record<string, any>; agenda: string[] }>();
  for (const r of rows) {
    if (!inWindow(r.CONF_DATE, ctx.from, ctx.to) || !ctx.committees.some((c) => String(r.COMM_NAME).startsWith(c))) continue;
    const m = meetings.get(r.CONF_ID) ?? meetings.set(r.CONF_ID, { row: r, agenda: [] }).get(r.CONF_ID)!;
    if (r.SUB_NAME && !m.agenda.includes(r.SUB_NAME)) m.agenda.push(r.SUB_NAME);
  }
  return [...meetings.values()].map(({ row: r, agenda }): RawItem => ({
    id: `${SOURCE_ID}:${r.CONF_ID}`,
    sourceId: SOURCE_ID,
    sourceType: 'minutes',
    // Written as on the record page: "제22대 제439회 제6차 OO위원회 (2026년 11월 09일)" → "제6차 OO위원회 (2026.11.09.)".
    title: String(r.TITLE).replace(/^제\d+대\s*제\d+회\s*/, '').replace(/\((\d{4})년 (\d{2})월 (\d{2})일\)/, '($1.$2.$3.)').trim(),
    url: r.CONF_LINK_URL ?? r.PDF_LINK_URL,
    publishedAt: r.CONF_DATE,
    institution: r.COMM_NAME,
    committee: r.COMM_NAME,
    excerpt: clip(agenda.join(' / ')),
    matchText: agenda.join(' / '),
    fetchedAt: ctx.fetchedAt,
  }));
}

export const assemblyMinutes: Connector = {
  id: SOURCE_ID,
  label: '국회 위원회 회의록',
  async fetch(ctx) {
    const rows = [];
    for (const month of monthsIn(ctx.from, ctx.to)) rows.push(...(await assemblyRows('ncwgseseafwbuheph', { DAE_NUM: ASSEMBLY_AGE, CONF_DATE: month })));
    return minutesItems(rows, { ...ctx, committees: ctx.profile.committees });
  },
};
