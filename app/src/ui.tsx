// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Shared UI: the app handle every screen receives, business labels, small components and the object drawer.
import type { ReactNode } from 'react';
import { Button, Drawer } from '@blueprintjs/core';
import { monthDay } from '../../ontology/index.ts';
import type { ActionName, AuditEntry, Ctx, Marking, ObjectRecord, Store, View } from '../../ontology/index.ts';
import type { AgentRun } from '../../agent/index.ts';
export { billName } from '../../agent/index.ts';

export type Tone = 'none' | 'primary' | 'success' | 'warning' | 'danger';

export interface App {
  store: Store;
  view: View; // the viewer's marking-filtered view; every screen reads through it
  ctx: Ctx;
  clientId: string;
  client: ObjectRecord;
  act: (name: ActionName, params: Record<string, unknown>, ok?: string) => string[] | undefined; // created ids, or undefined on refusal
  notify: (msg: string, tone?: Tone) => void;
  inspect: (id: string) => void;
  go: (path: string) => void;
  runs: Record<string, AgentRun>;
  runAgent: () => Promise<AgentRun | undefined>;
  when: (a: AuditEntry) => string; // 'Nov 16 14:32': seeded time for the opening, the viewer's own time for what they did

}

// ---- Labels ----
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** '2026-11-19' -> 'Nov 19'. Dates are plain strings, so no time zone can shift them. */
export const md = monthDay;
export const wmd = (d: string) => `${DAYS[new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay()]}, ${md(d)}`;
export const pretty = (s: unknown) => String(s ?? '').replace(/_/g, ' ');
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const STAGE: Record<string, string> = {
  public_comment: 'Legislative notice', submitted: 'Submitted', committee_referred: 'Referred to committee',
  committee_review: 'On the committee agenda', subcommittee: 'In subcommittee review', subcommittee_passed: 'Passed the subcommittee',
  committee_passed: 'Passed the full committee', lj_review: 'In Legislation and Judiciary review', plenary_pending: 'Awaiting the plenary vote',
  passed: 'Passed', merged_alternative: 'Merged into a committee alternative', withdrawn: 'Withdrawn',
};
export const LEVEL: Record<string, string> = { act_now: 'Act now', engage: 'Engage', monitor: 'Monitor', watch: 'Watch' };
/** The client's stance as readers see it. A watching brief (stored as monitor) reads as No position. */
export const POSITION: Record<string, string> = { support: 'Support', amend: 'Amend', oppose: 'Oppose', monitor: 'No position' };
export const STANCE: Record<string, string> = { supportive: 'Supportive', neutral: 'Neutral', opposed: 'Opposed', unconfirmed: 'Unconfirmed' };
export const LEVEL3: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
export const SOURCE: Record<string, string> = { bill_update: 'Bill tracker', press_release: 'Press release', public_notice: 'Notice', news: 'News', minutes: 'Minutes', seminar: 'Seminar', ministry_press: 'Ministry press release', gazette: 'Official Gazette' };
/** Who acted, from an actor id: readers see a role, never an internal id. */
export const person = (actor?: string) => (!actor ? '' : actor.startsWith('agent') ? 'Assistant' : actor.startsWith('principal') ? 'Engagement lead' : actor.startsWith('consultant') ? 'Consultant' : actor.startsWith('system') ? 'Collector' : actor);
export function nameOf(o?: ObjectRecord): string {
  if (!o) return '';
  if (o.type === 'Interaction') return `${o.kind === 'call' ? 'Call' : 'Meeting'} on ${md(o.date)}`;
  if (o.type === 'Evidence') return o.excerpt;
  if (o.type === 'Event' && ['full_committee', 'subcommittee', 'plenary'].includes(o.kind)) return `${o.name}, ${md(o.date)}`; // these names repeat; the date tells them apart
  return String(o.shortTitle ?? o.name ?? o.title ?? o.question ?? kindLabel(o));
}
/** Generated sentences carry ISO dates; readers get 'Nov 19'. */
export const prose = (s: string) => s.replace(/(\d{4})-(\d{2})-(\d{2})/g, (d) => md(d));

/** One line on who someone is: committee role for lawmakers, title for officials and aides, kind for organizations. */
export function roleOf(view: View, o: ObjectRecord): string {
  if (o.type === 'StakeholderOrg') return cap(pretty(o.kind === 'ngo' ? 'civic group' : o.kind));
  if (o.kind !== 'lawmaker') return [o.title, o.orgId ? view.get(o.orgId)?.name : undefined].filter(Boolean).join(', ') || cap(pretty(o.kind));
  const ms = view.links({ type: 'member_of', from: o.id }).filter((l) => !(l.props?.until && l.props.until < view.baseDate));
  const rank = (l: (typeof ms)[number]) => ({ chair: 0, secretary: 1 }[l.props?.role as string] ?? 2) * 2 + (view.get(l.to)?.kind === 'subcommittee' ? 1 : 0);
  const top = [...ms].sort((a, b) => rank(a) - rank(b))[0];
  if (!top) return `Lawmaker, ${o.party}`;
  const inst = view.get(top.to)!;
  const committee = inst.kind === 'subcommittee' ? view.get(inst.parentId)!.name : inst.name;
  const role = top.props?.role === 'member' ? 'Member' : cap(String(top.props?.role));
  return `${inst.kind === 'subcommittee' ? `Subcommittee ${lower1(role)}` : role}, ${committee}`;
}

/** Current committee seats, each committee once with its subcommittees in brackets: "Health and Welfare Committee (Bill Review Subcommittee)". */
export function memberships(view: View, personId: string): { id: string; subs: ObjectRecord[] }[] {
  const out = new Map<string, ObjectRecord[]>();
  for (const l of view.links({ type: 'member_of', from: personId })) {
    if (l.props?.until && l.props.until < view.baseDate) continue;
    const inst = view.get(l.to);
    if (!inst) continue;
    const top = inst.kind === 'subcommittee' && inst.parentId ? inst.parentId : inst.id;
    out.set(top, [...(out.get(top) ?? []), ...(inst.id === top ? [] : [inst])]);
  }
  return [...out].map(([id, subs]) => ({ id, subs }));
}
export const MemberOf = ({ app, personId }: { app: App; personId: string }) => (
  <>
    {memberships(app.view, personId).map((m, i) => (
      <span key={m.id}>{i ? ', ' : ''}<ObjLink id={m.id} app={app} />{m.subs.length > 0 && <> ({m.subs.map((x, j) => <span key={x.id}>{j ? ', ' : ''}<ObjLink id={x.id} app={app} label={String(x.name).split(',')[0]} /></span>)})</>}</span>
    ))}
  </>
);

export const kindOf = (o: ObjectRecord) =>
  o.type === 'StakeholderOrg' ? 'Organization' : ({ lawmaker: 'Lawmaker', official: 'Government official', staffer: 'Legislative aide', org_rep: 'Organization representative', academic: 'Academic' } as Record<string, string>)[o.kind] ?? o.type;

// ---- Components ----
export function MarkTag({ m, app }: { m: Marking; app: App }) {
  const id = m.slice('CLIENT:'.length);
  return m === 'PUBLIC'
    ? <span className="chip chip-public">Shared across clients</span>
    : <span className="chip chip-client">Confidential · {app.view.get(id)?.name ?? id}</span>;
}
/** Who can see a record, in words: fictional shared records are not public records, so they never carry a Public label. */
export const visibility = (app: App, o: ObjectRecord) => {
  const m = o.markings.find((x) => x !== 'PUBLIC');
  return m ? `Confidential · ${app.view.get(m.slice('CLIENT:'.length))?.name ?? 'client'}` : 'Shared across clients';
};

/** Small square tag: tone picks the palette. */
export const T = ({ children, tone = 'plain' }: { children: ReactNode; tone?: 'hi' | 'md' | 'plain' | 'op' | 'navy' | 'rust' }) =>
  <span className={`t t-${tone}`}>{children}</span>;

export const Section = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
  <section className={`sec ${className ?? ''}`}>
    <h2 className="label">{title}</h2>
    {children}
  </section>
);

export const Empty = ({ children }: { children: ReactNode }) => <p className="muted small">{children}</p>;

export function ObjLink({ id, app, label }: { id: string; app: App; label?: ReactNode }) {
  const o = app.view.get(id);
  if (!o) return <span>{label ?? id}</span>;
  const go = () => (o.type === 'Bill' ? app.go(`issues/${id}`) : app.inspect(id));
  return <a onClick={go}>{label ?? nameOf(o)}</a>;
}

// ---- Markdown: what the weekly report uses (headings, lists, tables, footnotes, obj: links) ----
function inline(text: string, app: App): ReactNode[] {
  return text.split(/(\[[^\]]+\]\(obj:[^)]+\)|\[\^\d+\]|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={i}>{prose(part.slice(2, -2))}</b>;
    const link = part.match(/^\[([^\]]+)\]\(obj:([^)]+)\)$/);
    if (link) return <ObjLink key={i} id={link[2]} label={prose(link[1])} app={app} />;
    const fn = part.match(/^\[\^(\d+)\]$/);
    if (fn) return <sup key={i} className="fn">{fn[1]}</sup>;
    return prose(part);
  });
}

export function Markdown({ text, app }: { text: string; app: App }) {
  const out: ReactNode[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const k = `l${i}`;
    if (line.startsWith('## ')) out.push(<h4 key={k}>{inline(line.slice(3), app)}</h4>);
    else if (line.startsWith('# ')) out.push(<h3 key={k}>{inline(line.slice(2), app)}</h3>);
    else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (lines[i]?.startsWith('- ')) items.push(lines[i++].slice(2));
      i--;
      out.push(<ul key={k}>{items.map((t, j) => <li key={j}>{inline(t, app)}</li>)}</ul>);
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (lines[i]?.startsWith('|')) {
        if (!/^\|[-|\s]+\|$/.test(lines[i])) rows.push(lines[i].slice(1, -1).split('|').map((c) => c.trim()));
        i++;
      }
      i--;
      out.push(
        <div key={k} className="table-wrap"><table className="tbl">
          <thead><tr>{rows[0].map((h, n) => <th key={n}>{h}</th>)}</tr></thead>
          <tbody>{rows.slice(1).map((r, j) => <tr key={j}>{r.map((c, n) => <td key={n}>{inline(c, app)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
    } else if (/^\[\^\d+\]: /.test(line)) {
      const [, n, rest] = line.match(/^\[\^(\d+)\]: (.*)$/)!;
      out.push(<div key={k} className="footnote"><sup>{n}</sup> {inline(rest, app)}</div>);
    } else if (line.trim()) out.push(<p key={k}>{inline(line, app)}</p>);
  }
  return <div className="md">{out}</div>;
}

// ---- Object drawer: any object the viewer can see, as properties and links ----
const HIDE = new Set(['id', 'type', 'markings', 'synthetic', 'clientId', 'keywords', 'stageHistory', 'body', 'team', 'url', 'sourceUrl', 'signalId', 'nameKo', 'sourceIds', 'parentId']);
const ACTOR_KEYS = new Set(['setBy', 'approvedBy', 'createdBy', 'assessedBy', 'addedBy', 'updatedBy', 'resolvedBy']);
const LABEL: Record<string, string> = { district: 'Seat', terms: 'Terms served', billNo: 'Bill number', sourceType: 'Source', confidence: 'Match', relevance: 'Relevance', reviewStatus: 'Review', aideTo: 'Aide to', orgId: 'Organization', collectedAt: 'Collected' };
const human = (k: string) => LABEL[k] ?? cap(k.replace(/Ids?$/, '').replace(/([A-Z])/g, ' $1').toLowerCase().trim());
const LINK_LABEL: Record<string, [string, string]> = {
  sponsors: ['Sponsors', 'Sponsored by'], cosponsors: ['Cosponsors', 'Cosponsored by'], member_of: ['Member of', 'Members'],
  referred_to: ['Referred to', 'Bills referred'], amends: ['Amends', 'Amended by'], about: ['About', 'Related'],
  agenda_item: ['On the agenda', 'On the agenda of'], testifies_at: ['Spoke at', 'Speakers'], regulates: ['Administers', 'Administered by'],
  mentions: ['Names', 'Named in'], affects: ['Affects', 'Affected by'], watches: ['Follows', 'Followed by'],
  produced_for: ['Prepared for', 'Reports'], raised_by: ['Raised by', 'Raised'], advises: ['Advises', 'Advisers'], coalition_with: ['Joint statement with', 'Joint statement with'],
};
// A 0-1 number reads better as a word.
const strength = (n: number) => (n >= 0.8 ? 'High' : n >= 0.5 ? 'Medium' : 'Low');

function value(app: App, k: string, v: unknown): ReactNode {
  if (ACTOR_KEYS.has(k)) return person(String(v));
  if (k === 'sourceType') return SOURCE[String(v)] ?? (v === 'official_record' ? 'Official record' : pretty(v));
  if (k === 'owner') return ({ human: 'Our team', agent: 'Assistant', client: 'Client' } as Record<string, string>)[String(v)] ?? pretty(v);
  if ((k === 'confidence' || k === 'relevance') && typeof v === 'number') return strength(v);
  if (Array.isArray(v)) return v.every((x) => typeof x === 'string' && app.view.get(x))
    ? v.map((x, i) => <span key={x}>{i ? ', ' : ''}<ObjLink id={x} app={app} /></span>)
    : v.join('; ');
  if (typeof v === 'string' && app.view.get(v)) return <ObjLink id={v} app={app} />;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return md(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return cap(String(v).replace(/_/g, ' '));
}

export function ObjectDrawer({ id, app, onClose }: { id?: string; app: App; onClose: () => void }) {
  const o = id ? app.view.get(id) : undefined;
  const out = o ? app.view.links({ from: o.id }) : [];
  const inc = o ? app.view.links({ to: o.id }) : [];
  const groups = new Map<string, string[]>();
  for (const l of out) if (l.type !== 'member_of') groups.set(LINK_LABEL[l.type]?.[0] ?? l.type, [...(groups.get(LINK_LABEL[l.type]?.[0] ?? l.type) ?? []), l.to]);
  const seats = o ? memberships(app.view, o.id) : [];
  for (const l of inc) groups.set(LINK_LABEL[l.type]?.[1] ?? l.type, [...(groups.get(LINK_LABEL[l.type]?.[1] ?? l.type) ?? []), l.from]);
  return (
    <Drawer isOpen={!!o} onClose={onClose} title={o ? nameOf(o) : ''} size="min(520px, 100vw)">
      {o && (
        <div className="drawer-body">
          <p className="row">{kindLabel(o)}</p>
          {o.type === 'Signal' && <p className="quote">{o.rawText}</p>}
          <h3 className="label">Properties</h3>
          <dl className="kv">
            {Object.entries(o).filter(([k, v]) => !HIDE.has(k) && v !== undefined && !(o.type === 'Signal' && ['rawText', 'title'].includes(k))).map(([k, v]) => (
              <div key={k}><dt>{human(k)}</dt><dd>{value(app, k, v)}</dd></div>
            ))}
            <div><dt>Visibility</dt><dd>{visibility(app, o)}</dd></div>
          </dl>
          {(groups.size > 0 || seats.length > 0) && <h3 className="label">Links</h3>}
          <dl className="kv">
            {seats.length > 0 && <div><dt>Member of</dt><dd><MemberOf app={app} personId={o.id} /></dd></div>}
            {[...groups].map(([k, ids]) => (
              <div key={k}><dt>{k}</dt><dd>{[...new Set(ids)].slice(0, 12).map((x, i) => <span key={x}>{i ? ', ' : ''}<ObjLink id={x} app={app} /></span>)}{ids.length > 12 ? `, and ${ids.length - 12} more` : ''}</dd></div>
            ))}
          </dl>
          <Button text="Close" onClick={onClose} />
        </div>
      )}
    </Drawer>
  );
}

const kindLabel = (o: ObjectRecord) => ({
  Signal: SOURCE[o.sourceType] ?? 'Item', Evidence: 'Evidence', Event: 'Event', Institution: 'Institution', Issue: 'Issue', Provision: 'Provision',
  Decision: 'Decision', Task: 'Task', Interaction: 'Contact', Deliverable: 'Report', ClientPosition: 'Client position',
  StakeholderAssessment: 'Stakeholder assessment', RiskOpportunity: o.kind === 'risk' ? 'Risk' : 'Opportunity', Strategy: 'Strategy',
  MonitoringProfile: 'Monitoring settings', PilotEvaluation: 'Trial',
} as Record<string, string>)[o.type] ?? (o.type === 'Person' || o.type === 'StakeholderOrg' ? kindOf(o) : o.type);
