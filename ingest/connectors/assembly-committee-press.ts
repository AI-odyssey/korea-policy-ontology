// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Committee press releases ("위원회" board of the Assembly press service), tagged with the committee
// the title names. Official API: 보도자료 ninnagrlaelvtzfnt, newest first.
import { assemblyRows, committeeIn } from './assembly-api.ts';
import { inWindow, plain } from '../core/text.ts';
import type { Connector, FetchContext, RawItem } from '../core/types.ts';

export const SOURCE_ID = 'assembly-committee-press';

export function committeePressItems(rows: Record<string, any>[], ctx: Pick<FetchContext, 'from' | 'to' | 'fetchedAt'>): RawItem[] {
  return rows
    .filter((r) => inWindow(r.WRITE_DATE, ctx.from, ctx.to))
    .map((r): RawItem => {
      const title = plain(r.TITLE);
      const committee = committeeIn(title);
      return {
        id: `${SOURCE_ID}:${r.NUM}`,
        sourceId: SOURCE_ID,
        sourceType: 'committee_press',
        title,
        url: r.CONTENT_URL,
        publishedAt: r.WRITE_DATE,
        institution: committee,
        committee,
        fetchedAt: ctx.fetchedAt,
      };
    });
}

export const assemblyCommitteePress: Connector = {
  id: SOURCE_ID,
  label: '국회 위원회 보도자료',
  async fetch(ctx) {
    const rows = await assemblyRows('ninnagrlaelvtzfnt', { BBS_TITLE: '위원회' }, (rows) => rows.at(-1)!.WRITE_DATE < ctx.from);
    return committeePressItems(rows, ctx);
  },
};
