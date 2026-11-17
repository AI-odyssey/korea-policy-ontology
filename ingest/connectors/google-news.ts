// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// News via the Google News RSS search feed, one query per high- and medium-priority keyword.
// Links stay as Google News article links (they redirect to the publisher in a browser); the outlet comes
// from the feed's <source>. Only titles, links, dates and outlets are kept, never article text.
import { fetchText } from '../core/http.ts';
import { stripOutlet } from '../core/dedup.ts';
import { decodeEntities, inWindow, kstDate } from '../core/text.ts';
import type { Connector, FetchContext, RawItem } from '../core/types.ts';

export const SOURCE_ID = 'google-news';

const tag = (xml: string, name: string) => new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1];

export function rssItems(xml: string, fetchedAt: string): RawItem[] {
  const out: RawItem[] = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = tag(item, 'title'), link = tag(item, 'link'), pub = tag(item, 'pubDate');
    if (!title || !link || !pub) continue;
    const outlet = tag(item, 'source');
    out.push({
      id: `${SOURCE_ID}:${(tag(item, 'guid') ?? link).trim()}`,
      sourceId: SOURCE_ID,
      sourceType: 'news',
      title: stripOutlet(decodeEntities(title)),
      url: decodeEntities(link.trim()),
      publishedAt: kstDate(pub),
      institution: outlet ? decodeEntities(outlet).trim() : undefined,
      fetchedAt,
    });
  }
  return out;
}

export function feedUrl(term: string, days: number): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`"${term}" when:${days}d`)}&hl=ko&gl=KR&ceid=KR:ko`;
}

export const googleNews: Connector = {
  id: SOURCE_ID,
  label: '뉴스 (Google News RSS)',
  async fetch(ctx: FetchContext) {
    // when:Nd counts back from now, so cover the whole window from today.
    const days = Math.max(1, Math.ceil((Date.now() - Date.parse(`${ctx.from}T00:00:00+09:00`)) / 86_400_000));
    const terms = ctx.profile.keywords.filter((k) => k.priority !== 'low').map((k) => k.term);
    const byId = new Map<string, RawItem>();
    for (const term of terms) for (const i of rssItems(await fetchText(feedUrl(term, days)), ctx.fetchedAt)) byId.set(i.id, i);
    return [...byId.values()].filter((i) => inWindow(i.publishedAt, ctx.from, ctx.to));
  },
};
