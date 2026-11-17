// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// New bills (member, committee chair and government) proposed in the window.
// Official API: 법률안 심사 및 처리(의안검색) TVBPMBILL11, newest first.
import { ASSEMBLY_AGE, assemblyRows } from './assembly-api.ts';
import { inWindow } from '../core/text.ts';
import type { Connector, FetchContext, RawItem } from '../core/types.ts';

export const SOURCE_ID = 'assembly-bills';

export function billItems(rows: Record<string, any>[], ctx: Pick<FetchContext, 'from' | 'to' | 'fetchedAt'>): RawItem[] {
  return rows
    .filter((r) => inWindow(r.PROPOSE_DT, ctx.from, ctx.to))
    .map((r): RawItem => ({
      id: `${SOURCE_ID}:${r.BILL_ID}`,
      sourceId: SOURCE_ID,
      sourceType: r.PROPOSER_KIND === '정부' ? 'gov_bill' : 'bill',
      title: r.BILL_NAME,
      url: r.LINK_URL,
      publishedAt: r.PROPOSE_DT,
      institution: r.PROPOSER_KIND === '정부' ? '정부' : undefined,
      billNo: r.BILL_NO,
      committee: r.CURR_COMMITTEE ?? undefined,
      excerpt: [r.PROPOSER, r.CURR_COMMITTEE ? `소관 ${r.CURR_COMMITTEE}` : '소관위 미회부'].filter(Boolean).join(' · '),
      fetchedAt: ctx.fetchedAt,
    }));
}

export const assemblyBills: Connector = {
  id: SOURCE_ID,
  label: '국회 의안 (의원·정부 발의)',
  async fetch(ctx) {
    const rows = await assemblyRows('TVBPMBILL11', { AGE: ASSEMBLY_AGE }, (rows) => rows.at(-1)!.PROPOSE_DT < ctx.from);
    return billItems(rows, ctx);
  },
};
