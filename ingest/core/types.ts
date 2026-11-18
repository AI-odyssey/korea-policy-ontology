// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Shapes shared by every connector. A connector turns one public source into RawItems for a date window;
// the runner matches them against a client's MonitoringProfile and merges duplicates.

export const SOURCE_TYPES = [
  'bill', 'gov_bill', 'legislative_notice', 'admin_notice', 'gazette', 'minutes',
  'seminar', 'committee_press', 'ministry_press', 'news',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface RawItem {
  id: string; // `${sourceId}:${stable key from the source}`
  sourceId: string;
  sourceType: SourceType;
  title: string;
  url: string;
  publishedAt: string; // YYYY-MM-DD (KST)
  institution?: string; // ministry, host office or news outlet
  billNo?: string;
  committee?: string;
  excerpt?: string; // at most ~300 characters; never a full article body
  matchText?: string; // longer official text used only for keyword matching (a full meeting agenda); never stored
  fetchedAt: string; // ISO datetime
}

export interface Keyword {
  term: string;
  priority: 'high' | 'medium' | 'low';
  synonyms?: string[];
  exclude?: string[]; // the keyword does not count when any of these appear
}

export interface MonitoringProfile {
  clientId: string;
  keywords: Keyword[];
  committees: string[]; // current standing committee names, e.g. 행정안전위원회
  agencies: string[];
  sources?: string[]; // connector ids to run; all when omitted
  watchBills?: string[]; // bill numbers (의안번호) whose stage changes are always reported
  excludeOutlets?: string[]; // news outlets and offices whose items are never kept (commentary columns, think-tank blogs)
}

export interface Window {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
}

export interface FetchContext extends Window {
  profile: MonitoringProfile;
  fetchedAt: string;
}

export interface Connector {
  id: string;
  label: string;
  fetch(ctx: FetchContext): Promise<RawItem[]>;
}

/** A kept item: the earliest copy of a story, its keyword match and every outlet that carried it. */
export interface ScoredItem extends RawItem {
  score: number;
  matched: string[];
  outlets?: string[];
}
