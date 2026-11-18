// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// This week: the client executive's page. It renders the weekly brief (agent/brief.ts), the same model the report uses.
import { useState } from 'react';
import { Button, HTMLSelect } from '@blueprintjs/core';
import { REVIEW_THRESHOLD, signalQueue } from '../../ontology/index.ts';
import type { ObjectRecord } from '../../ontology/index.ts';
import { decisionsLine, decisionStale, proposeTriage, regenerateDecision, triageParams, weeklyBrief } from '../../agent/index.ts';
import type { TimelineItem } from '../../agent/index.ts';
import { Empty, ObjLink, POSITION, Section, T, md, nameOf, person, prose, roleOf, wmd } from './ui.tsx';
import type { App } from './ui.tsx';
import { PublicRecords } from './live.tsx';

export function ThisWeek({ app }: { app: App }) {
  const b = weeklyBrief(app.view, app.clientId);
  return (
    <div className="page">
      <h1 className="headline">{b.headline}</h1>
      <p className="lead">{[b.lead, decisionsLine(b.decisions.length)].filter(Boolean).join(' ')}</p>

      <Pending app={app} />

      <Section title="Decisions needed">
        {!b.decisions.length && <Empty>Nothing to decide this week.</Empty>}
        {b.decisions.map((d) => <DecisionItem key={d.id} d={d} app={app} />)}
      </Section>

      <div className="g2">
        <Section title="Risks"><RoList app={app} items={b.risks} /></Section>
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
        <Section title="Asks of the client">
          {!b.asks.length && <Empty>Nothing needed from the client right now.</Empty>}
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
      <div className="item-title">{prose(d.question)} {stale ? <T tone="rust">Out of date: {stale}</T> : d.dueDate && <T tone="hi">Due {md(d.dueDate)}</T>}</div>
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

function Timeline({ app, items }: { app: App; items: TimelineItem[] }) {
  const shown = items.slice(0, 6);
  if (!shown.length) return <Empty>Nothing scheduled in the next 30 days.</Empty>;
  return (
    <ol className="tl">
      {shown.map((x, i) => (
        <li key={x.id} className={i === 0 ? 'now' : ''}>
          <div className="tl-date">{wmd(x.date)}</div>
          <div className="tl-title"><ObjLink id={x.id} app={app} label={x.title} /></div>
          <div className="tl-who">{x.who} · {x.status}</div>
        </li>
      ))}
    </ol>
  );
}

/** New items the assistant was not sure about, for this client. Items returned with Undo land here too. */
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

/** What the assistant filed on its own this week for this client. Undo returns an item to the queue. */
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

/** Requests from the assistant or a consultant, and reports in review, that wait for the engagement lead. Hidden when empty. */
export function Pending({ app, empty }: { app: App; empty?: string }) {
  const pending = app.store.pendingApprovals(app.ctx);
  const reports = app.view.list('Deliverable', (d) => d.clientId === app.clientId && d.status === 'in_review').sort((a, b) => a.id.localeCompare(b.id));
  if (!pending.length && !reports.length) return empty ? <Section title="Waiting for your approval"><Empty>{empty}</Empty></Section> : null;
  const decide = (fn: () => void, msg: string) => {
    try {
      fn();
      app.notify(msg, 'success');
    } catch (e) {
      app.notify((e as Error).message, 'danger');
    }
  };
  const what = (p: (typeof pending)[number]) => {
    const x = p.params as Record<string, any>;
    if (p.action === 'setClientPosition') return { title: `Change the client position on the ${nameOf(app.view.get(x.targetId)).toLowerCase()} to ${POSITION[x.stance]}`, detail: x.rationale };
    if (p.action === 'addRiskOpportunity') return { title: `New ${x.kind}: ${x.title}`, detail: x.summary };
    if (p.action === 'updateStrategy') return { title: `Update the strategy on ${nameOf(app.view.get(x.issueId))}`, detail: (x.messages ?? []).join(' ') };
    return { title: p.action, detail: '' };
  };
  return (
    <Section title="Waiting for your approval">
      {pending.map((p) => {
        const w = what(p);
        return (
          <div key={p.id} className="item">
            <div className="item-title">{w.title} <span className="sub">Requested by {p.requesterRole === 'agent' ? 'the assistant' : `a ${person(p.requestedBy).toLowerCase()}`}</span></div>
            {w.detail && <p className="sub">{w.detail}</p>}
            <div className="row">
              <Button size="small" intent="primary" text="Approve" onClick={() => decide(() => app.store.approve(app.ctx, p.id), 'Approved.')} />
              <Button size="small" variant="minimal" text="Decline" onClick={() => decide(() => app.store.reject(app.ctx, p.id), 'Declined.')} />
            </div>
          </div>
        );
      })}
      {reports.map((d) => (
        <div key={d.id} className="item">
          <div className="item-title"><a onClick={() => app.go('reports')}>Approve: {prose(d.title)}</a> <span className="sub">Prepared by the {person(d.createdBy).toLowerCase()}</span></div>
        </div>
      ))}
    </Section>
  );
}
