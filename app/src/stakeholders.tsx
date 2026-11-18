// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Stakeholders: the client's assessed network on one issue, an object panel, and who decides at each stage.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, HTMLSelect, InputGroup } from '@blueprintjs/core';
import cytoscape from 'cytoscape';
import { addDays, clientBills, stageGates, stakeholderNetwork } from '../../ontology/index.ts';
import { subcommitteeName } from '../../agent/index.ts';
import type { ObjectRecord } from '../../ontology/index.ts';
import { Empty, LEVEL3, MemberOf, ObjLink, STANCE, Section, billName, cap, kindOf, md, memberships, nameOf, roleOf } from './ui.tsx';
import type { App } from './ui.tsx';

// Hue = stance, lightness = relevance (high, medium, low).
const SHADE: Record<string, string[]> = {
  supportive: ['#1F3A5F', '#5F7899', '#AFBDD0'],
  neutral: ['#59616B', '#979EA7', '#CDD1D6'],
  opposed: ['#97391C', '#C2795C', '#E5BCAA'],
  unconfirmed: ['#FFFFFF', '#FFFFFF', '#FFFFFF'],
};
const REL = ['high', 'medium', 'low'];
const SIZE: Record<string, number> = { high: 46, medium: 32, low: 22 };
const LINE: Record<string, string> = { cosponsor: 'solid', committee: 'dotted', event: 'dashed' };
const LINE_LABEL: Record<string, string> = { cosponsor: 'Cosponsors', committee: 'Same committee', event: 'Joint event' };
const fill = (a: ObjectRecord) => SHADE[a.stance][REL.indexOf(a.relevance)];

/** Moves `n` working days from `date` (negative goes back), skipping weekends. */
function workday(date: string, n: number): string {
  let d = date;
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; ) {
    d = addDays(d, step);
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export function Stakeholders({ app, path }: { app: App; path?: string }) {
  const { view, clientId } = app;
  const mine = view.list('StakeholderAssessment', (a) => a.clientId === clientId);
  const impact = new Map(view.links({ type: 'affects', to: clientId }).map((l) => [l.from, l.props?.impact as string]));
  const issues = view.sources(clientId, 'affects').filter((i) => mine.some((a) => a.issueId === i.id))
    .sort((a, b) => REL.indexOf(impact.get(a.id)!) - REL.indexOf(impact.get(b.id)!) || a.id.localeCompare(b.id));
  const [first, second] = (path ?? '').split('/');
  const issueId = first?.startsWith('iss-') ? first : mine.find((a) => a.subjectId === first)?.issueId ?? issues[0]?.id;
  const rank = (x: ObjectRecord) => REL.indexOf(x.influence) * 3 + REL.indexOf(x.relevance);
  const lead = mine.filter((a) => a.issueId === issueId).sort((x, y) => rank(x) - rank(y) || x.subjectId.localeCompare(y.subjectId))[0];
  const selected = (first?.startsWith('iss-') ? second : first) || lead?.subjectId;
  if (!issueId) return <div className="page"><Empty>No stakeholders assessed yet.</Empty></div>;
  const select = (id?: string) => app.go(`stakeholders/${issueId}${id ? `/${id}` : ''}`);
  const issue = view.get(issueId)!;

  return (
    <div className="page">
      <h1 className="headline">{issue.title}</h1>
      <p className="muted small">Names and positions are invented; no real member is assessed.</p>
      <div className="seg" role="tablist">
        {issues.map((i) => <button key={i.id} role="tab" aria-selected={i.id === issueId} className={i.id === issueId ? 'on' : ''} onClick={() => app.go(`stakeholders/${i.id}`)}>{i.title}</button>)}
      </div>
      <div className="split">
        <div className="split-main">
          <Graph app={app} issueId={issueId} selected={selected} onSelect={select} />
          <Legend />
          <PeopleList app={app} issueId={issueId} selected={selected} onSelect={select} />
          <Lane app={app} issueId={issueId} onSelect={select} />
        </div>
        <aside className="split-side">
          {selected && view.get(selected) && <Panel key={`${issueId}/${selected}`} app={app} issueId={issueId} subjectId={selected} onSelect={select} />}
        </aside>
      </div>
    </div>
  );
}

function Graph({ app, issueId, selected, onSelect }: { app: App; issueId: string; selected?: string; onSelect: (id?: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core>(undefined);
  const net = useMemo(() => stakeholderNetwork(app.view, app.clientId, issueId), [app.view, app.clientId, issueId]);
  const pick = useRef(onSelect);
  pick.current = onSelect;
  // Labels keep a readable size on a phone: the graph is zoomed out there, so the font grows to compensate.
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;

  useEffect(() => {
    if (!ref.current) return;
    const n = net.nodes.length;
    // Start on a circle so the force layout has no random seed: the same data always gives the same picture.
    const elements = [
      ...net.nodes.map(({ assessment: a, subject: s }, i) => ({
        data: { id: s.id, label: nameOf(s), color: fill(a), size: SIZE[a.influence], border: a.stance === 'unconfirmed' ? SHADE.neutral[REL.indexOf(a.relevance)] : fill(a) },
        position: { x: 200 + 160 * Math.cos((2 * Math.PI * i) / n), y: 200 + 160 * Math.sin((2 * Math.PI * i) / n) },
      })),
      ...net.edges.map((e) => ({ data: { id: `${e.a}~${e.b}`, source: e.a, target: e.b, line: LINE[e.kind] } })),
    ];
    const cy = cytoscape({
      container: ref.current,
      elements,
      autoungrabify: false,
      minZoom: 0.4,
      maxZoom: 2,
      layout: {
        name: 'cose', randomize: false, animate: false, nodeDimensionsIncludeLabels: true, padding: 24,
        idealEdgeLength: () => 120, nodeRepulsion: () => 26000, edgeElasticity: () => 60, gravity: 0.3, numIter: 2000, componentSpacing: 50, nodeOverlap: 24,
      } as cytoscape.LayoutOptions,
      style: [
        { selector: 'node', style: {
          'background-color': 'data(color)', width: 'data(size)', height: 'data(size)', 'border-width': 1.5, 'border-color': 'data(border)',
          label: 'data(label)', color: '#1B2430', 'font-size': narrow ? 22 : 11, 'font-family': 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', 'text-valign': 'bottom', 'text-margin-y': 5,
          'text-wrap': 'wrap', 'text-max-width': narrow ? '150px' : '96px', 'text-background-color': '#F7F6F2', 'text-background-opacity': 0.85, 'text-background-padding': '1px',
        } },
        { selector: 'node.sel', style: { 'border-width': 3, 'border-color': '#1B2430', 'font-weight': 600 } },
        { selector: 'edge', style: { width: 1.4, 'line-color': '#8E97A3', 'line-style': 'data(line)' as never, 'curve-style': 'straight' } },
        { selector: 'edge.near', style: { 'line-color': '#1B2430' } },
      ],
    });
    cy.on('tap', 'node', (e) => pick.current(e.target.id()));
    cy.on('tap', (e) => e.target === cy && pick.current(undefined));
    cyRef.current = cy;
    return () => cy.destroy();
  }, [net, narrow]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('sel near');
    if (selected) cy.getElementById(selected).addClass('sel').connectedEdges().addClass('near');
  }, [selected, net]);

  return <div ref={ref} className="graph" aria-label="Stakeholder network" />;
}

/** The same people as the graph, as a list a phone can read: stance, influence and role. */
function PeopleList({ app, issueId, selected, onSelect }: { app: App; issueId: string; selected?: string; onSelect: (id: string) => void }) {
  const { nodes } = stakeholderNetwork(app.view, app.clientId, issueId);
  const rank = (a: ObjectRecord) => REL.indexOf(a.influence) * 3 + REL.indexOf(a.relevance);
  const rows = [...nodes].sort((x, y) => rank(x.assessment) - rank(y.assessment) || x.subject.id.localeCompare(y.subject.id));
  return (
    <ul className="people" aria-label="Stakeholders on this issue">
      {rows.map(({ assessment: a, subject: s }) => (
        <li key={s.id} className={s.id === selected ? 'on' : ''}>
          <i className={`dot dot-${a.stance}`} />
          <a onClick={() => onSelect(s.id)}><b>{nameOf(s)}</b></a>
          <span className="sub"> {STANCE[a.stance]}, {LEVEL3[a.influence].toLowerCase()} influence · {roleOf(app.view, s)}</span>
        </li>
      ))}
    </ul>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      <span className="lg-group">
        {(['supportive', 'neutral', 'opposed', 'unconfirmed'] as const).map((s) => <span key={s}><i className={`sw dot-${s}`} />{STANCE[s]}</span>)}
      </span>
      <span className="lg-group">
        {REL.map((r, i) => <span key={r}><i className="sw" style={{ background: SHADE.supportive[i] }} />{LEVEL3[r]} relevance</span>)}
      </span>
      <span className="lg-group">
        {(['high', 'medium', 'low'] as const).map((r) => <span key={r}><i className="sz" style={{ width: SIZE[r] / 2.6, height: SIZE[r] / 2.6 }} />{LEVEL3[r]} influence</span>)}
      </span>
      <span className="lg-group">
        {Object.entries(LINE).map(([k, style]) => <span key={k}><i className="ln" style={{ borderTopStyle: style as 'solid' }} />{LINE_LABEL[k]}</span>)}
      </span>
    </div>
  );
}

const GATE: Record<string, string> = { subcommittee: 'Subcommittee', committee: 'Full committee', lj: 'Legislation and Judiciary', plenary: 'Plenary session' };
const ROLE: Record<string, string> = { chair: 'Chair', secretary: 'Secretary' };

function Lane({ app, issueId, onSelect }: { app: App; issueId: string; onSelect: (id: string) => void }) {
  const { view, clientId } = app;
  const eng = view.list('Engagement', (e) => e.clientId === clientId)[0];
  const watched = new Set(eng ? view.targets(eng.id, 'watches').map((o) => o.id) : []);
  const bills = view.sources(issueId, 'about').filter((b) => b.type === 'Bill' && !['passed', 'merged_alternative', 'withdrawn'].includes(b.stage))
    .sort((a, b) => Number(watched.has(b.id)) - Number(watched.has(a.id)) || a.id.localeCompare(b.id));
  const [billId, setBill] = useState<string>();
  const bill = bills.find((b) => b.id === billId) ?? bills[0];
  if (!bill) return null;
  const stance = (id: string) => view.list('StakeholderAssessment', (a) => a.clientId === clientId && a.subjectId === id && a.issueId === issueId)[0];

  return (
    <Section title="Who decides at each stage">
      {bills.length > 1 && (
        <HTMLSelect value={bill.id} onChange={(e) => setBill(e.target.value)} options={bills.map((b) => ({ value: b.id, label: billName(b) }))} aria-label="Bill" />
      )}
      {bills.length === 1 && <p className="sub">{billName(bill)}</p>}
      <div className="lane">
        {stageGates(view, bill.id).map((g) => (
          <div key={g.key} className={`gate gate-${g.status}`}>
            <div className="gate-name">{g.key === 'subcommittee' ? cap(subcommitteeName(view, g.institutionId)) : GATE[g.key]}</div>
            <div className="sub">{g.status === 'done' ? (g.date ? `Passed ${md(g.date)}` : 'Passed') : g.status === 'closed' ? 'Closed' : g.date ? md(g.date) : 'Not scheduled'}</div>
            <div className="chips">
              {g.key === 'plenary' && <span className="pp">Floor vote</span>}
              {g.deciders.map((d) => {
                const a = stance(d.id);
                return (
                  <button key={d.id} className={`pp ${a ? `pp-${a.stance}` : ''}`} onClick={() => (a ? onSelect(d.id) : app.inspect(d.id))}>
                    {d.name} <span className="pp-role">{ROLE[d.role]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Panel({ app, issueId, subjectId, onSelect }: { app: App; issueId: string; subjectId: string; onSelect: (id: string) => void }) {
  const { view, clientId } = app;
  const s = view.get(subjectId)!;
  const a = view.list('StakeholderAssessment', (x) => x.clientId === clientId && x.subjectId === subjectId && x.issueId === issueId)[0];
  const [mode, setMode] = useState<'stance' | 'contact' | 'meeting'>();
  // An open meeting task for this person, whoever created it: by subject, or by name in the title.
  const planned = view.list('Task', (x) => x.clientId === clientId && x.status === 'open' && /\bmeet/i.test(x.title) && (x.subjectId === subjectId || String(x.title).includes(nameOf(s))))[0];
  // Default due date: the working day before the next meeting where this person decides, else two working days out.
  const nextMeeting = view.sources(issueId, 'about').filter((b) => b.type === 'Bill')
    .flatMap((b) => stageGates(view, b.id).filter((g) => g.date && g.date >= view.baseDate && g.deciders.some((d) => d.id === subjectId)).map((g) => g.date!))
    .sort()[0];
  const meetingDue = nextMeeting ? workday(nextMeeting, -1) : workday(view.baseDate, 2);
  const net = stakeholderNetwork(view, clientId, issueId);
  const neighbors = net.edges.filter((e) => e.a === subjectId || e.b === subjectId).map((e) => (e.a === subjectId ? e.b : e.a));
  // Only bills on this client's issues are named; others are counted, since naming them reads like another client's file.
  const allBills = [...new Set([...view.links({ type: 'sponsors', from: subjectId }), ...view.links({ type: 'cosponsors', from: subjectId })].map((l) => l.to))];
  const ours = new Set(clientBills(view, clientId).map((b) => b.id));
  const sponsored = allBills.filter((id) => ours.has(id));
  const otherBills = allBills.length - sponsored.length;
  const seats = memberships(view, subjectId);
  const spoke = view.links({ type: 'testifies_at', from: subjectId }).map((l) => l.to);
  const rep = s.type === 'Person' ? s : view.list('Person', (p) => p.orgId === s.id)[0];
  const contacts = view.list('Interaction', (x) => x.clientId === clientId && (x.participantIds.includes(subjectId) || (rep && x.participantIds.includes(rep.id))));
  const list = (ids: string[]) => [...new Set(ids)].slice(0, 6).map((id, i) => <span key={id}>{i ? ', ' : ''}<ObjLink id={id} app={app} /></span>);

  return (
    <div className="panel">
      <div className="sub">{kindOf(s)}</div>
      <h2 className="panel-name">{nameOf(s)}</h2>
      <h3 className="label">Properties</h3>
      <dl className="kv">
        <div><dt>Role</dt><dd>{roleOf(view, s)}</dd></div>
        <div><dt>Stance</dt><dd>{a ? <><i className={`dot dot-${a.stance}`} />{STANCE[a.stance]}</> : 'Not assessed'}</dd></div>
        {a && <div><dt>Influence</dt><dd>{LEVEL3[a.influence]}</dd></div>}
        {a && <div><dt>Relevance</dt><dd>{LEVEL3[a.relevance]}</dd></div>}
        {a?.interests && <div><dt>Interests</dt><dd>{a.interests}</dd></div>}
        {a?.basisIds?.length > 0 && <div><dt>Based on</dt><dd>{list(a.basisIds)}</dd></div>}
      </dl>
      <h3 className="label">Links</h3>
      <dl className="kv">
        {allBills.length > 0 && <div><dt>Bills</dt><dd>{list(sponsored)}{otherBills > 0 && <span className="sub">{sponsored.length ? ' · ' : ''}{otherBills} other {otherBills === 1 ? 'bill' : 'bills'}</span>}</dd></div>}
        {seats.length > 0 && <div><dt>Member of</dt><dd><MemberOf app={app} personId={subjectId} /></dd></div>}
        {spoke.length > 0 && <div><dt>Spoke at</dt><dd>{list(spoke)}</dd></div>}
        <div><dt>Contacts</dt><dd>{contacts.length ? contacts.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<ObjLink id={c.id} app={app} label={`${c.kind === 'call' ? 'Call' : 'Meeting'} ${md(c.date)}`} /></span>) : 'None yet'}</dd></div>
        {neighbors.length > 0 && <div><dt>Connected to</dt><dd>{neighbors.map((id, i) => <span key={id}>{i ? ', ' : ''}<a onClick={() => onSelect(id)}>{nameOf(view.get(id))}</a></span>)}</dd></div>}
      </dl>
      <h3 className="label">Actions</h3>
      <div className="row">
        {planned
          ? <Button size="small" text="Meeting already planned" disabled title={`${planned.title}, by ${md(planned.dueDate)}`} />
          : <Button size="small" intent="primary" text="Request meeting" active={mode === 'meeting'} onClick={() => setMode(mode === 'meeting' ? undefined : 'meeting')} />}
        <Button size="small" text="Update stance" active={mode === 'stance'} onClick={() => setMode(mode === 'stance' ? undefined : 'stance')} />
        {rep && <Button size="small" text="Log contact" active={mode === 'contact'} onClick={() => setMode(mode === 'contact' ? undefined : 'contact')} />}
      </div>
      {mode === 'meeting' && !planned && <MeetingForm app={app} subject={s} due={meetingDue < view.baseDate ? view.baseDate : meetingDue} reason={nextMeeting ? `the working day before ${md(nextMeeting)}, when ${nameOf(s)} decides` : undefined} done={() => setMode(undefined)} />}
      {mode === 'stance' && <StanceForm app={app} issueId={issueId} subject={s} current={a} done={() => setMode(undefined)} />}
      {mode === 'contact' && rep && <ContactForm app={app} issueId={issueId} person={rep} done={() => setMode(undefined)} />}
    </div>
  );
}

function MeetingForm({ app, subject, due, reason, done }: { app: App; subject: ObjectRecord; due: string; reason?: string; done: () => void }) {
  const [date, setDate] = useState(due);
  const add = () => {
    if (app.act('createTask', { clientId: app.clientId, title: `Request a meeting with ${nameOf(subject)}`, dueDate: date, owner: 'human', subjectId: subject.id }, 'Meeting request added to the timeline.')) done();
  };
  return (
    <div className="add-form">
      <label className="sub">Request by <InputGroup type="date" value={date} min={app.view.baseDate} onChange={(e) => setDate(e.target.value)} aria-label="Request by" /></label>
      <Button size="small" intent="primary" text="Add to timeline" disabled={!date} onClick={add} />
      <Button size="small" variant="minimal" text="Cancel" onClick={done} />
      {reason && <span className="sub">Suggested: {reason}.</span>}
    </div>
  );
}

function StanceForm({ app, issueId, subject, current, done }: { app: App; issueId: string; subject: ObjectRecord; current?: ObjectRecord; done: () => void }) {
  const { view, clientId } = app;
  const [stance, setStance] = useState(current?.stance ?? 'unconfirmed');
  const [influence, setInfluence] = useState(current?.influence ?? 'medium');
  const [relevance, setRelevance] = useState(current?.relevance ?? 'medium');
  // Records the stance could rest on: what is already cited, sponsorships, events and contacts, recent news.
  const candidates = [...new Set([
    ...(current?.basisIds ?? []),
    ...[...view.links({ type: 'sponsors', from: subject.id }), ...view.links({ type: 'cosponsors', from: subject.id })].map((l) => l.to),
    ...view.links({ type: 'testifies_at', from: subject.id }).map((l) => l.to),
    ...view.list('Interaction', (x) => x.clientId === clientId && x.participantIds.includes(subject.id)).map((x) => x.id),
    ...view.sources(subject.id, 'mentions').sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)).slice(0, 3).map((x) => x.id),
  ])].slice(0, 8);
  const [basis, setBasis] = useState<string[]>(current?.basisIds ?? []);
  const needsBasis = stance !== 'unconfirmed' && !basis.length;
  const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
  const save = () => app.act('assessStakeholder', { clientId, subjectId: subject.id, issueId, stance, influence, relevance, basisIds: basis, ...(current?.interests ? { interests: current.interests } : {}) }, 'Stance updated.') && done();
  return (
    <div className="form">
      <div className="row">
        <HTMLSelect value={stance} onChange={(e) => setStance(e.target.value)} options={opts(STANCE)} aria-label="Stance" />
        <HTMLSelect value={influence} onChange={(e) => setInfluence(e.target.value)} options={opts({ high: 'High influence', medium: 'Medium influence', low: 'Low influence' })} aria-label="Influence" />
        <HTMLSelect value={relevance} onChange={(e) => setRelevance(e.target.value)} options={opts({ high: 'High relevance', medium: 'Medium relevance', low: 'Low relevance' })} aria-label="Relevance" />
      </div>
      <div className="sub">Based on</div>
      {candidates.map((id) => (
        <Checkbox key={id} checked={basis.includes(id)} label={`${nameOf(view.get(id))}${view.get(id)?.collectedAt ? ` (${md(view.get(id)!.collectedAt)})` : ''}`}
          onChange={() => setBasis(basis.includes(id) ? basis.filter((x) => x !== id) : [...basis, id])} />
      ))}
      {needsBasis && <p className="sub warn">{candidates.length ? 'Pick at least one record as the basis.' : 'No record to rest this stance on yet. Keep it unconfirmed for now.'}</p>}
      <div className="row">
        <Button size="small" intent="primary" text="Save" disabled={needsBasis} onClick={save} />
        <Button size="small" variant="minimal" text="Cancel" onClick={done} />
      </div>
    </div>
  );
}

function ContactForm({ app, issueId, person, done }: { app: App; issueId: string; person: ObjectRecord; done: () => void }) {
  const [kind, setKind] = useState('meeting');
  const [summary, setSummary] = useState('');
  const save = () => app.act('logInteraction', { clientId: app.clientId, kind, date: app.view.baseDate, participantIds: [person.id], summary, targetIds: [issueId] }, 'Contact logged.') && done();
  return (
    <div className="form">
      <div className="sub">With {person.name}, {md(app.view.baseDate)}</div>
      <div className="row">
        <HTMLSelect value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: 'meeting', label: 'Meeting' }, { value: 'call', label: 'Call' }]} aria-label="Kind" />
        <InputGroup size="small" placeholder="What was said" value={summary} onChange={(e) => setSummary(e.target.value)} className="grow" />
      </div>
      <div className="row">
        <Button size="small" intent="primary" text="Save" disabled={!summary.trim()} onClick={save} />
        <Button size="small" variant="minimal" text="Cancel" onClick={done} />
      </div>
    </div>
  );
}
