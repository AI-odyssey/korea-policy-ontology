// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// This week: the page the head of government affairs works from. It renders the weekly brief (agent/brief.ts), the same model the report uses.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, HTMLSelect } from '@blueprintjs/core';
import { impactOf, responseLevel, REVIEW_THRESHOLD, signalQueue } from '../../ontology/index.ts';
import type { ObjectRecord } from '../../ontology/index.ts';
import { decisionStale, proposeTriage, regenerateDecision, sourceFor, triageParams, weeklyBrief } from '../../agent/index.ts';
import type { Brief } from '../../agent/index.ts';
import { TIMELINE_DAYS } from '../../agent/index.ts';
import type { TimelineItem } from '../../agent/index.ts';
import { Empty, LEVEL, LEVEL3, ObjLink, POSITION, STAGE, STANCE, Section, T, md, nameOf, person, prose, roleOf, wmd } from './ui.tsx';
import type { App } from './ui.tsx';
import { PublicRecords } from './live.tsx';

export function ThisWeek({ app }: { app: App }) {
  const b = weeklyBrief(app.view, app.clientId);
  return (
    <div className="page">
      <h1 className="headline">{b.headline}</h1>
      {b.lead && <p className="lead">{b.lead}</p>}
      <Counts app={app} decisions={b.decisions.length} risks={b.risks.length} />
      <Trace app={app} brief={b} />

      <Section title="Decisions for leadership">
        {!b.decisions.length && <Empty>Nothing for leadership to decide this week.</Empty>}
        {b.decisions.map((d) => <DecisionItem key={d.id} d={d} app={app} />)}
      </Section>

      <div className="g2">
        <Section title="Risks"><Proposed app={app} /><RoList app={app} items={b.risks} /></Section>
        <Section title="Opportunities"><RoList app={app} items={b.opportunities} /></Section>
      </div>

      <Section title="Timeline and actions"><Timeline app={app} items={b.timeline} /></Section>

      <div className="g2 g2-wide">
        <Section title="Stakeholder moves">
          {!b.moves.length && <Empty>No recorded moves this week.</Empty>}
          {b.moves.slice(0, 5).map((m) => (
            <div key={m.subject.id} className="item move">
              <div><i className={`dot dot-${m.stance}`} /><a onClick={() => app.go(`stakeholders/${m.subject.id}`)}><b>{nameOf(m.subject)}</b></a> <span className="sub">{roleOf(app.view, m.subject)}</span></div>
              <div className="sub">{m.text} <span>({[md(m.date), m.at, m.issueTitle].filter(Boolean).join(', ')})</span></div>
            </div>
          ))}
        </Section>
        <Section title="Needed from other teams">
          {!b.asks.length && <Empty>Nothing needed from other teams right now.</Empty>}
          {b.asks.map((t) => (
            <div key={t.id} className="item ask">
              <span className="grow">{t.title}</span>
              <span className="sub nowrap">By {md(t.dueDate)}</span>
              <Button size="small" variant="minimal" text="Mark received" onClick={() => app.act('completeTask', { taskId: t.id }, 'Marked as received.')} />
            </div>
          ))}
        </Section>
      </div>

      <div className="g2 g2-wide">
        <Section title="New items to confirm"><ToConfirm app={app} /></Section>
        <AutoFiled app={app} />
      </div>

      <PublicRecords app={app} limit={5} />
    </div>
  );
}

function DecisionItem({ d, app }: { d: ObjectRecord; app: App }) {
  const [choosing, setChoosing] = useState(false);
  const alts = d.alternatives as string[];
  const [alt, setAlt] = useState(alts[0] ?? '');
  const source = app.view.links({ type: 'raised_by', from: d.id })[0]?.to;
  const stale = decisionStale(app.view, d);
  const regenerate = () => {
    try {
      const fresh = regenerateDecision(app.store, app.ctx, d.id);
      app.notify(fresh ? 'Withdrawn and raised again from the current assessment.' : 'Withdrawn. Nobody left on the agenda needs persuading, so no new decision was raised.', 'success');
    } catch (e) {
      app.notify((e as Error).message, 'danger');
    }
  };
  const resolve = (resolution: string, note?: string) => app.act('resolveDecision', { decisionId: d.id, resolution, ...(note ? { note } : {}) },
    resolution === 'approve' ? 'Approved. A follow-up task is on the timeline.' : resolution === 'reject' ? 'Declined.' : `Going with: ${note}`);
  return (
    <div className="item">
      <div className="item-title">{prose(d.question)} {stale ? <T tone="rust">Out of date: {stale}</T> : d.dueDate && <T tone="hi">{d.dueDate === app.view.baseDate ? 'Due today' : `Due ${md(d.dueDate)}`}</T>}</div>
      <p className="sub"><b>Recommended:</b> {prose(d.recommendation)}</p>
      {alts.length > 0 && <p className="sub"><b>Alternatives:</b> {alts.map((a, i) => `${i + 1}) ${a}`).join('  ')}</p>}
      {stale ? (
        <div className="row">
          <span className="sub">The recommendation rests on an earlier assessment of {nameOf(app.view.get(d.targetId))}.</span>
          <Button size="small" intent="primary" text="Regenerate" onClick={regenerate} />
          {source && <ObjLink id={source} app={app} label="Source" />}
        </div>
      ) : !choosing ? (
        <div className="row">
          <Button size="small" intent="primary" text="Approve" onClick={() => resolve('approve')} />
          {alts.length > 0 && <Button size="small" text="Choose an alternative" onClick={() => setChoosing(true)} />}
          <Button size="small" variant="minimal" text="Decline" onClick={() => resolve('reject')} />
          {source && <ObjLink id={source} app={app} label="Source" />}
        </div>
      ) : (
        <div className="row">
          <HTMLSelect value={alt} onChange={(e) => setAlt(e.target.value)} options={alts} aria-label="Alternative" />
          <Button size="small" intent="primary" text="Confirm" onClick={() => resolve('alternative', alt)} />
          <Button size="small" variant="minimal" text="Cancel" onClick={() => setChoosing(false)} />
        </div>
      )}
    </div>
  );
}

const URGENCY: Record<string, string> = { imminent: 'Imminent', in_progress: 'In progress', ongoing: 'Ongoing' };

function RoList({ app, items }: { app: App; items: ObjectRecord[] }) {
  if (!items.length) return <Empty>None recorded.</Empty>;
  return (
    <>
      {items.map((r) => {
        const bill = (r.subjectIds as string[]).find((id) => app.view.get(id)?.type === 'Bill');
        return (
          <div key={r.id} className="item">
            <div className="item-title">
              <T tone={r.kind === 'risk' ? (r.impact === 'high' ? 'hi' : 'md') : 'op'}>{r.impact === 'high' ? 'High impact' : 'Medium impact'}</T>
              <T>{r.dueDate ? `Due ${md(r.dueDate)}` : URGENCY[r.urgency]}</T>
              {bill ? <ObjLink id={bill} app={app} label={r.title} /> : r.title}
            </div>
            <p className="sub">{r.summary}</p>
          </div>
        );
      })}
    </>
  );
}

/**
 * How the headline was worked out, one record per step: the meeting and the notice it comes from, the bill's stage and
 * where it was read, the response level and its rules, the company position, the impact rating, and the decision with
 * the records it rests on. Every name opens the record.
 */
function Trace({ app, brief }: { app: App; brief: Brief }) {
  const [open, setOpen] = useState(false);
  const top = brief.bills[0];
  if (!top) return null;
  const { view, clientId } = app;
  const { bill, facts: f } = top;
  const last = (bill.stageHistory as { stage: string; date: string; sourceId?: string }[]).at(-1)!;
  const notice = f.slot ? sourceFor(view, f.slot.id) : undefined;
  const impacts = view.targets(bill.id, 'about').map((i) => impactOf(view, i.id, clientId)).filter((x): x is ObjectRecord => !!x);
  const decision = brief.decisions.find((d) => d.subjectId === bill.id);
  const basis = decision ? view.targets(decision.id, 'derived_from') : [];
  const who = (actor?: string) => (actor ? person(actor) : '');
  const rows: [string, ReactNode][] = [
    ...(f.slot ? [['Meeting', <><ObjLink id={f.slot.id} app={app} label={`${f.slot.name}, ${md(f.slot.date)}`} />{notice && <> from <ObjLink id={notice} app={app} label="the agenda notice" /></>}</>] as [string, ReactNode]] : []),
    ['Bill stage', <><ObjLink id={bill.id} app={app} label={STAGE[bill.stage]} /> since {md(last.date)}{last.sourceId && <>, read from <ObjLink id={last.sourceId} app={app} label="the bill tracker" /></>}</>],
    ['Response level', <>{LEVEL[top.level]}: {prose(responseLevel(view, bill.id, clientId, brief.since).reasons.join('; ').replace(/Moved to ([a-z_]+) on/, (_m, k: string) => `${STAGE[k] ?? k} on`).replace(/[a-z]+(?:_[a-z]+)+/g, (k) => STAGE[k] ?? k.replace(/_/g, ' ')))}</>],
    ...(f.position ? [['Company position', <><ObjLink id={f.position.id} app={app} label={POSITION[f.position.stance]} />, set by {who(f.position.setBy)}{f.position.approvedBy && `, approved by ${who(f.position.approvedBy)}`}</>] as [string, ReactNode]] : []),
    ...impacts.map((i) => ['Impact rating', <><ObjLink id={i.id} app={app} label={`${LEVEL3[i.level]} on ${view.get(i.issueId)?.title}`} />: {i.rationale} Rated by {who(i.assessedBy)}{i.approvedBy && `, approved by ${who(i.approvedBy)}`}.</>] as [string, ReactNode]),
    ...(decision ? [['Decision', <><ObjLink id={decision.id} app={app} label={prose(decision.question)} /> rests on {basis.map((o, k) => <span key={o.id}>{k ? ', ' : ''}<ObjLink id={o.id} app={app} label={o.type === 'StakeholderAssessment' ? `${nameOf(view.get(o.subjectId))} (${STANCE[o.stance]})` : o.type === 'Event' ? 'the meeting' : o.type === 'ClientPosition' ? 'the position' : 'the impact rating'} /></span>)}</>] as [string, ReactNode]] : []),
  ];
  return (
    <div className="trace">
      <Button size="small" variant="minimal" icon={open ? 'chevron-down' : 'chevron-right'} text="How this was worked out" onClick={() => setOpen(!open)} />
      {open && <dl className="kv trace-list">{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    </div>
  );
}

/** Risks the assistant proposes this week, approved or declined in the Risks list itself. */
function Proposed({ app }: { app: App }) {
  const req = app.store.pendingApprovals(app.ctx).filter((p) => p.action === 'addRiskOpportunity');
  const decide = (fn: () => void, msg: string) => { try { fn(); app.notify(msg, 'success'); } catch (e) { app.notify((e as Error).message, 'danger'); } };
  return <>{req.map((p) => {
    const x = p.params as { title: string; summary: string; impact: string };
    return (
      <div key={p.id} className="item proposed">
        <div className="item-title"><T tone="hi">Proposed</T> <T>{x.impact === 'high' ? 'High impact' : 'Medium impact'}</T> {x.title} <span className="sub">by the assistant; once approved it joins the risks and the report</span></div>
        <p className="sub">{x.summary}</p>
        <div className="row">
          <Button size="small" intent="primary" text="Approve" onClick={() => decide(() => app.store.approve(app.ctx, p.id), 'Added to the risks.')} />
          <Button size="small" variant="minimal" text="Decline" onClick={() => decide(() => app.store.reject(app.ctx, p.id), 'Proposal declined.')} />
        </div>
      </div>
    );
  })}</>;
}

/** The week in four numbers, read before anything else. */
function Counts({ app, decisions, risks }: { app: App; decisions: number; risks: number }) {
  const pending = app.store.pendingApprovals(app.ctx);
  const reports = app.view.list('Deliverable', (d) => d.clientId === app.clientId && d.status === 'in_review').length;
  const risks_ = pending.filter((p) => p.action === 'addRiskOpportunity').length;
  const positions = pending.filter((p) => p.action === 'setClientPosition').length;
  const where = [
    reports ? <a key="r" onClick={() => app.go('reports')}>{reports} {reports === 1 ? 'report' : 'reports'}</a> : null,
    risks_ ? <span key="k">{risks_} proposed {risks_ === 1 ? 'risk' : 'risks'}</span> : null,
    positions ? <a key="p" onClick={() => app.go('issues')}>{positions} position {positions === 1 ? 'change' : 'changes'}</a> : null,
  ].filter(Boolean);
  const approvals = pending.length + reports;
  const unsure = signalQueue(app.view).filter((s) => { const p = proposeTriage(app.view, s, app.clientId); return p.action === 'link' && p.relevantToClient; }).length;
  return (
    <div className="counts">
      <span><b>{decisions}</b> {decisions === 1 ? 'decision' : 'decisions'} for leadership</span>
      <span><b>{risks}</b> {risks === 1 ? 'risk' : 'risks'}</span>
      <span><b>{approvals}</b> awaiting your approval{where.length > 0 && <> ({where.map((w, i) => <span key={i}>{i ? ', ' : ''}{w}</span>)})</>}</span>
      <span><b>{unsure}</b> new {unsure === 1 ? 'item' : 'items'} to confirm</span>
    </div>
  );
}

const TIMELINE_SHOWN = 5;

function Timeline({ app, items }: { app: App; items: TimelineItem[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <Empty>Nothing scheduled in the next {TIMELINE_DAYS} days.</Empty>;
  return (
    <>
    <ol className="tl">
      {(all ? items : items.slice(0, TIMELINE_SHOWN)).map((x, i) => (
        <li key={x.id} className={i === 0 ? 'now' : ''}>
          <div className="tl-date">{wmd(x.date)}</div>
          <div className="tl-title"><ObjLink id={x.id} app={app} label={x.title} /></div>
          <div className="tl-who">{x.who} · {x.status}</div>
        </li>
      ))}
    </ol>
    {items.length > TIMELINE_SHOWN && <Button size="small" variant="minimal" text={all ? 'Show fewer' : `Show all ${items.length}`} onClick={() => setAll(!all)} />}
    </>
  );
}

/** New items the assistant was not sure about, for this company. Items returned with Undo land here too. */
function ToConfirm({ app }: { app: App }) {
  const { view, clientId } = app;
  const items = signalQueue(view)
    .map((s) => ({ s, p: proposeTriage(view, s, clientId) }))
    .filter(({ p }) => p.action === 'link' && p.relevantToClient)
    .sort((a, b) => b.s.collectedAt.localeCompare(a.s.collectedAt) || a.s.id.localeCompare(b.s.id))
    .slice(0, 5);
  if (!items.length) return <Empty>Nothing to confirm.</Empty>;
  return (
    <>
      {items.map(({ s, p }) => (
        <div key={s.id} className="item confirm">
          <div className="grow">
            <div className="item-title"><ObjLink id={s.id} app={app} label={s.title} /></div>
            <div className="sub">{md(s.collectedAt)} · {p.confidence < REVIEW_THRESHOLD ? 'Possibly about' : 'About'} {view.get(p.issueId!)?.title}</div>
          </div>
          <div className="row nowrap">
            <Button size="small" text="Confirm" onClick={() => app.act('triageSignal', triageParams(p, clientId), 'Filed under the issue.')} />
            <Button size="small" variant="minimal" text="Not relevant" onClick={() => app.act('triageSignal', { clientId, signalId: s.id, relevance: p.relevance, dismiss: true, reason: 'Not relevant' }, 'Set aside.')} />
          </div>
        </div>
      ))}
    </>
  );
}

/** What the assistant filed on its own this week for this company. Undo returns an item to the queue. */
function AutoFiled({ app }: { app: App }) {
  const [all, setAll] = useState(false);
  // The latest triage or undo on each item decides: filed by the assistant and not undone or redone by a person.
  const entries = app.store.auditEntries(app.ctx).filter((a) => ['triageSignal', 'reopenSignal'].includes(a.action) && a.status === 'executed');
  const last = new Map<string, (typeof entries)[number]>();
  for (const a of entries) last.set((a.params as { signalId: string }).signalId, a);
  const filedNow = new Set(app.view.list('SignalTriage', (t) => t.clientId === app.clientId && t.status === 'filed').map((t) => t.signalId));
  const filed = [...last.values()]
    .filter((a) => a.action === 'triageSignal' && a.role === 'agent' && !(a.params as { dismiss?: boolean }).dismiss)
    .map((a) => app.view.get((a.params as { signalId: string }).signalId))
    .filter((s): s is ObjectRecord => !!s && filedNow.has(s.id))
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt) || a.id.localeCompare(b.id));
  if (!filed.length) return null;
  return (
    <Section title={`Filed automatically (${filed.length})`}>
      {(all ? filed : filed.slice(0, 4)).map((s) => (
        <div key={s.id} className="item confirm">
          <div className="grow">
            <div className="item-title"><ObjLink id={s.id} app={app} label={s.title} /></div>
            <div className="sub">{md(s.collectedAt)} · {app.view.targets(s.id, 'about').map((i) => i.title).join(', ')}</div>
          </div>
          <Button size="small" variant="minimal" text="Undo" onClick={() => app.act('reopenSignal', { clientId: app.clientId, signalId: s.id }, 'Returned to the items to confirm.')} />
        </div>
      ))}
      {filed.length > 4 && <Button size="small" variant="minimal" text={all ? 'Show fewer' : `Show all ${filed.length}`} onClick={() => setAll(!all)} />}
    </Section>
  );
}
