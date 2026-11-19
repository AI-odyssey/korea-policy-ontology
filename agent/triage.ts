// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Rule-based triage: keyword and entity matching, no model involved.
// Which issue an item is about is a public question, answered from issue keywords and bill identifiers.
// How much it matters to one client is that client's question, answered from its MonitoringProfile.
import type { ObjectRecord, View } from '../ontology/runtime.ts';
import { REVIEW_THRESHOLD } from '../ontology/schema.ts';
import { monitoringProfile, PRIORITY_WEIGHT, profileMatch, signalText } from '../ontology/functions.ts';

export interface TriageProposal {
  signalId: string;
  action: 'link' | 'dismiss';
  issueId?: string;
  billId?: string;
  mentionIds: string[];
  relevance: number;
  confidence: number;
  excerpt: string;
  matched: string[]; // keywords and bill identifiers that fired
  suppressed: string[]; // client keywords cancelled by an exclude phrase
  rationale: string;
  relevantToClient: boolean;
}

const KEYWORD_WEIGHT = 0.45; // each distinct issue keyword hit (public routing, and relevance when no client profile applies)
const TITLE_WEIGHT = 0.6; // the bill's title appears
const NUMBER_WEIGHT = 0.9; // the exact bill number appears: an identifier, so it alone clears the 0.8 review line
const DISMISS_BELOW = 0.25;

// Independent evidence combines as 1 - prod(1 - w): two keywords = 0.70, a title hit plus two keywords = 0.88,
// an exact bill number alone = 0.90. Client keywords weigh by priority: high 0.6, medium 0.45, low 0.3.
const combine = (ws: number[]) => 1 - ws.reduce((p, w) => p * (1 - w), 1);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function proposeTriage(view: View, signal: ObjectRecord, clientId?: string): TriageProposal {
  const text = signalText(signal);
  const lower = text.toLowerCase();
  const bills = view.list('Bill');
  const numberHit = (b: ObjectRecord) => !!b.billNo && new RegExp(`\\b${b.billNo}\\b`, 'i').test(text); // bill numbers are [0-9A-Z-] only; a bill in notice has none
  const billHits = bills.filter((b) => lower.includes(b.title.toLowerCase()) || numberHit(b));

  let best = { issue: undefined as ObjectRecord | undefined, score: 0, kws: [] as string[], bill: undefined as ObjectRecord | undefined, billW: 0 };
  for (const issue of view.list('Issue')) {
    const kws = (issue.keywords as string[]).filter((k) => lower.includes(k.toLowerCase()));
    const bill = billHits.find((b) => view.targets(b.id, 'about').some((i) => i.id === issue.id));
    const billW = bill ? (numberHit(bill) ? NUMBER_WEIGHT : TITLE_WEIGHT) : 0;
    const score = combine([...kws.map(() => KEYWORD_WEIGHT), billW]);
    if (score > best.score) best = { issue, score, kws, bill, billW };
  }
  const billTag = best.bill ? [String(best.bill.billNo ?? best.bill.shortTitle)] : [];

  // With a client profile, the client's keywords replace the issue keywords as the relevance evidence.
  const profile = clientId ? monitoringProfile(view, clientId) : undefined;
  const pm = profile ? profileMatch(profile as never, text) : undefined;
  const dismiss = !best.issue || best.score < DISMISS_BELOW; // noise for everyone; a client's profile never dismisses a public item
  const clientScore = pm ? combine([...pm.hits.map((h) => PRIORITY_WEIGHT[h.priority]), best.billW]) : best.score;
  const relevance = round2(dismiss ? best.score : clientScore);
  const matched = pm && !dismiss ? [...pm.hits.map((h) => h.term), ...billTag] : [...best.kws, ...billTag];
  const affected = !!(clientId && best.issue && view.links({ type: 'affects', from: best.issue.id, to: clientId }).length);
  const relevantToClient = !dismiss && (pm ? pm.hits.length > 0 || (!!best.bill && affected) : affected);

  const mentionIds = [...view.list('Person'), ...view.list('Institution'), ...view.list('StakeholderOrg')]
    .filter((e) => String(e.name).length > 6 && text.includes(e.name)).map((e) => e.id).slice(0, 4);
  const sentence = text.split(/(?<=\.)\s+/).find((s) => matched.some((m) => s.toLowerCase().includes(m.toLowerCase()))) ?? signal.title;
  const suppressed = pm ? pm.suppressed.map((s) => s.term) : [];

  return {
    signalId: signal.id,
    action: dismiss ? 'dismiss' : 'link',
    ...(dismiss ? {} : { issueId: best.issue!.id, ...(best.bill ? { billId: best.bill.id } : {}) }),
    mentionIds: dismiss ? [] : mentionIds,
    relevance,
    confidence: Math.min(relevance, 0.99),
    excerpt: sentence.slice(0, 220),
    matched,
    suppressed,
    rationale: dismiss
      ? 'No tracked keyword or bill appears; looks like noise.'
      : !matched.length
        ? `About "${best.issue!.title}", but none of the company's keywords appear${suppressed.length ? ` (${suppressed.join(', ')} excluded here)` : ''}.`
        : `${matched.length} match${matched.length > 1 ? 'es' : ''} on "${best.issue!.title}": ${matched.join(', ')}.${relevance < REVIEW_THRESHOLD ? ' Below 0.8, so a human should confirm.' : ''}`,
    relevantToClient,
  };
}

export const triageParams = (p: TriageProposal, clientId: string) => ({
  clientId,
  signalId: p.signalId,
  relevance: p.relevance,
  confidence: p.confidence,
  excerpt: p.excerpt,
  ...(p.action === 'dismiss' ? { dismiss: true, reason: p.rationale } : { issueId: p.issueId, billId: p.billId, mentionIds: p.mentionIds }),
});
