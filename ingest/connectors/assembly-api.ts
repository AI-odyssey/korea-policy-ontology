// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// National Assembly Open API (open.assembly.go.kr), official and key-based: set ASSEMBLY_API_KEY.
// Every service returns {SERVICE: [{head}, {row}]}; pages hold at most 1,000 rows.
import { fetchJson } from '../core/http.ts';

export const ASSEMBLY_AGE = '22'; // 22nd National Assembly, 2024-05-30 to 2028-05-29
const BASE = 'https://open.assembly.go.kr/portal/openapi/';

type Row = Record<string, any>;
type Body = Record<string, [{ head: [{ list_total_count: number }, { RESULT: { CODE: string; MESSAGE: string } }] }, { row?: Row[] }]> & { RESULT?: { CODE: string; MESSAGE: string } };

export function apiKey(): string {
  const key = process.env.ASSEMBLY_API_KEY;
  if (!key) throw new Error('ASSEMBLY_API_KEY is not set');
  return key;
}

/** Rows of one service, page by page, until a page is short or `enough(rowsSoFar)` says stop. */
export async function assemblyRows(service: string, params: Record<string, string>, enough: (rows: Row[]) => boolean = () => false, maxPages = 20): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({ KEY: apiKey(), Type: 'json', pIndex: String(page), pSize: '1000', ...params });
    const body = await fetchJson<Body>(`${BASE}${service}?${q}`);
    const block = body[service];
    if (!block) {
      if (body.RESULT?.CODE === 'INFO-200') break; // no data
      throw new Error(`${service}: ${body.RESULT?.CODE ?? 'unexpected response'} ${body.RESULT?.MESSAGE ?? ''}`.trim());
    }
    const chunk = block[1]?.row ?? [];
    rows.push(...chunk);
    if (chunk.length < 1000 || enough(rows)) break;
  }
  return rows;
}

/** Months (YYYY-MM) touched by a window, for services that filter by a date prefix. */
export function monthsIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 7) <= to.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

// Committee short names used in Assembly press release titles.
export const COMMITTEE_ALIASES: Record<string, string[]> = {
  행정안전위원회: ['행정안전위', '행안위'],
  산업통상자원중소벤처기업위원회: ['산업통상자원중소벤처기업위', '산자중기위', '산자위'],
  보건복지위원회: ['보건복지위', '복지위'],
  정무위원회: ['정무위'],
  재정경제기획위원회: ['재정경제기획위', '재경위'],
  농림축산식품해양수산위원회: ['농림축산식품해양수산위', '농해수위'],
  국토교통위원회: ['국토교통위', '국토위'],
  과학기술정보방송통신위원회: ['과학기술정보방송통신위', '과방위'],
  기후에너지환경노동위원회: ['기후에너지환경노동위', '기후노동위'],
  법제사법위원회: ['법제사법위', '법사위'],
};

/** The full committee name a title refers to, by full name or short alias. */
export function committeeIn(title: string): string | undefined {
  return Object.entries(COMMITTEE_ALIASES).find(([full, short]) => title.includes(full) || short.some((s) => title.includes(s)))?.[0];
}
