// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Stage changes in the window for bills before the profile's committees and for watched bill numbers:
// placed on the committee agenda, committee decision, Legislation and Judiciary Committee steps, plenary.
// Official API: TVBPMBILL11 filtered by committee (CURR_COMMITTEE) or bill number (BILL_NO).
import { ASSEMBLY_AGE, assemblyRows } from './assembly-api.ts';
import { clip, inWindow } from '../core/text.ts';
import type { Connector, FetchContext, RawItem } from '../core/types.ts';

export const SOURCE_ID = 'assembly-bill-stages';

const STAGES: [date: string, label: string, result?: string][] = [
  ['CMT_PRESENT_DT', '소관위 상정'],
  ['CMT_PROC_DT', '소관위 의결', 'CMT_PROC_RESULT_CD'],
  ['LAW_SUBMIT_DT', '법사위 회부'],
  ['LAW_PRESENT_DT', '법사위 상정'],
  ['LAW_PROC_DT', '법사위 의결', 'LAW_PROC_RESULT_CD'],
  ['PROC_DT', '본회의 의결', 'PROC_RESULT_CD'],
];

export function stageItems(rows: Record<string, any>[], ctx: Pick<FetchContext, 'from' | 'to' | 'fetchedAt'>): RawItem[] {
  const out: RawItem[] = [];
  for (const r of rows) {
    for (const [field, label, resultField] of STAGES) {
      if (!inWindow(r[field], ctx.from, ctx.to)) continue;
      const stage = resultField && r[resultField] ? `${label}(${r[resultField]})` : label;
      out.push({
        id: `${SOURCE_ID}:${r.BILL_ID}:${field}`,
        sourceId: SOURCE_ID,
        sourceType: r.PROPOSER_KIND === '정부' ? 'gov_bill' : 'bill',
        title: `[${stage}] ${r.BILL_NAME}`,
        url: r.LINK_URL,
        publishedAt: r[field],
        billNo: r.BILL_NO,
        committee: r.CURR_COMMITTEE ?? undefined,
        excerpt: [r.PROPOSER, `제안 ${r.PROPOSE_DT}`, `${stage} ${r[field]}`].filter(Boolean).join(' · '),
        fetchedAt: ctx.fetchedAt,
      });
    }
  }
  return groupSameName(out);
}

/** Many bills share a name ("도로교통법 일부개정법률안"); the same step on the same day becomes one item listing the bill numbers. */
export function groupSameName(items: RawItem[]): RawItem[] {
  const groups = new Map<string, RawItem[]>();
  for (const i of items) groups.set(`${i.title}|${i.publishedAt}|${i.sourceType}`, [...(groups.get(`${i.title}|${i.publishedAt}|${i.sourceType}`) ?? []), i]);
  return [...groups.values()].map((g) => g.length === 1 ? g[0] : {
    ...g[0],
    id: `${SOURCE_ID}:${g[0].publishedAt}:${g[0].title}`,
    title: `${g[0].title} (${g.length}건)`,
    excerpt: clip(`의안번호 ${g.map((i) => i.billNo).join(', ')}`),
  });
}

export const assemblyBillStages: Connector = {
  id: SOURCE_ID,
  label: '국회 의안 단계 변경',
  async fetch(ctx) {
    const rows = new Map<string, Record<string, any>>();
    for (const committee of ctx.profile.committees) {
      for (const r of await assemblyRows('TVBPMBILL11', { AGE: ASSEMBLY_AGE, CURR_COMMITTEE: committee })) rows.set(r.BILL_ID, r);
    }
    for (const billNo of ctx.profile.watchBills ?? []) {
      for (const r of await assemblyRows('TVBPMBILL11', { AGE: ASSEMBLY_AGE, BILL_NO: billNo })) rows.set(r.BILL_ID, r);
    }
    return stageItems([...rows.values()], ctx);
  },
};
