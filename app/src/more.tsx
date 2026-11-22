// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Secondary screens: Reports, Audit log, Ontology.
import { useEffect, useState } from 'react';
import { Button } from '@blueprintjs/core';
import { weeklyBrief } from '../../agent/index.ts';
import { ACTION_NAMES, LINK_TYPE_NAMES, OBJECT_TYPE_NAMES, ROLES, actionTypes, functionTypes, linkTypes, objectTypes } from '../../ontology/index.ts';
import type { ObjectRecord } from '../../ontology/index.ts';
import type { ActionTypeDef, AuditEntry, LinkTypeDef, ObjectTypeDef } from '../../ontology/index.ts';
import { Empty, Markdown, POSITION, Section, T, cap, md, nameOf, person, pretty, prose } from './ui.tsx';
import type { App } from './ui.tsx';

const KIND: Record<string, string> = { weekly_report: 'Weekly report', issue_brief: 'Issue brief', comment_letter: 'Comment letter', meeting_prep: 'Meeting notes' };
const STATUS: Record<string, string> = { draft: 'Draft', in_review: 'In review', approved: 'Approved', sent: 'Sent' };
const WHO: Record<string, string> = { system: 'Collector', agent: 'Assistant', consultant: 'Analyst', principal: 'Head of government affairs' };
const clip = (s: string, n = 80) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, '')}...`);

// ---------------- Reports ----------------
/** The team's own question ("Meet X, a secretary of Y?") is not what company leadership reads. Show what was decided and what happens next. */
function clientDecisions(app: App, body: string): string {
  const since = weeklyBrief(app.view, app.clientId).since;
  const taken = app.view.list('Decision', (d) => d.clientId === app.clientId && d.status === 'resolved' && d.resolution !== 'withdraw' && String(d.openedAt).slice(0, 10) > since);
  const line = (d: ObjectRecord) => {
    const next = String(d.followUp ?? String(d.question).replace(/\?$/, ''));
    if (d.resolution === 'approve') return `- Agreed: ${next}.`;
    if (d.resolution === 'alternative') return `- Agreed: ${d.resolutionNote}.`;
    return `- Not pursued: ${next}.`;
  };
  return body.replace(/(## Decisions taken\n\n)(?:- .*\n?)+/, `$1${taken.map(line).join('\n')}\n`);
}

export function Reports({ app }: { app: App }) {
  const { view, clientId } = app;
  const list = view.list('Deliverable', (d) => d.clientId === clientId).sort((a, b) => (a.status === 'in_review' ? 0 : 1) - (b.status === 'in_review' ? 0 : 1) || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0));
  // Fix the selection on first render so approving a report does not jump to another one.
  const [sel, setSel] = useState<string | undefined>(() => (list.find((x) => x.status === 'in_review') ?? list[0])?.id);
  const [busy, setBusy] = useState(false);
  const d = view.get(sel ?? '') ?? list[0];
  // Printing shows only the report body; the class lets the print stylesheet hide everything else.
  useEffect(() => {
    document.body.classList.add('on-reports');
    return () => document.body.classList.remove('on-reports');
  }, []);
  const thisWeek = list.some((x) => x.kind === 'weekly_report' && String(x.title).includes(view.baseDate));
  const draft = async () => {
    setBusy(true);
    const run = await app.runAgent();
    setBusy(false);
    if (run?.deliverableId) setSel(run.deliverableId);
  };

  return (
    <div className="page">
      <h1 className="headline">Reports</h1>
      {!thisWeek && <div className="row"><Button intent="primary" loading={busy} text="Prepare this week's report" onClick={draft} /></div>}
      <div className="split reports">
        <div className="split-side reports-list">
          {list.map((x) => (
            <button key={x.id} className={`report-row ${x.id === d?.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>
              <span className="report-title">{prose(x.title)}</span>
              <span className="sub">{KIND[x.kind]} · {STATUS[x.status]}{x.sentAt ? ` ${md(x.sentAt)}` : ''}</span>
            </button>
          ))}
        </div>
        {d && (
          <div className="split-main">
            <div className="row">
              <T tone={d.status === 'in_review' ? 'hi' : d.status === 'sent' ? 'op' : 'plain'}>{STATUS[d.status]}</T>
              <span className="sub">Prepared by the {person(d.createdBy).toLowerCase()}{d.approvedBy ? `, approved by the ${person(d.approvedBy).toLowerCase()}` : ''}</span>
            </div>
            <div className="row">
              {d.status === 'draft' && <Button size="small" text="Send for review" onClick={() => app.act('submitForReview', { deliverableId: d.id }, 'In review.')} />}
              {d.status === 'in_review' && <Button size="small" intent="primary" text="Approve" onClick={() => app.act('approveDeliverable', { deliverableId: d.id }, 'Approved. Ready to send.')} />}
              {d.status === 'approved' && <Button size="small" intent="primary" text="Send to leadership" onClick={() => app.act('sendDeliverable', { deliverableId: d.id }, `Sent to ${app.client.name} leadership.`)} />}
              <Button size="small" variant="minimal" text="Print / Save as PDF" onClick={() => window.print()} />
            </div>
            <article className="memo"><Markdown text={clientDecisions(app, d.body)} app={app} /></article>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Audit log ----------------
const RESULT: Record<string, string> = { executed: 'Done', pending_approval: 'Waiting for review', rejected: 'Declined', denied: 'Refused' };

function describe(app: App, a: AuditEntry): string {
  const p = a.params as Record<string, any>;
  const n = (id?: string) => (id ? nameOf(app.view.get(id)) || 'a record' : '');
  switch (a.action) {
    case 'triageSignal': return p.dismiss ? `Set aside: ${n(p.signalId)}` : `Filed: ${n(p.signalId)}`;
    case 'raiseDecision': return `Raised a decision: ${clip(String(p.question))}`;
    case 'resolveDecision': return `${{ approve: 'Approved', alternative: 'Chose an alternative on', reject: 'Declined', withdraw: 'Withdrew' }[p.resolution as string]} a decision: ${clip(n(p.decisionId))}`;
    case 'draftDeliverable': return `Drafted: ${p.title}`;
    case 'submitForReview': return `Sent for review: ${n(p.deliverableId)}`;
    case 'redraftDeliverable': return `Brought up to date with the latest changes: ${n(p.deliverableId)}`;
    case 'approveDeliverable': return `Approved: ${n(p.deliverableId)}`;
    case 'sendDeliverable': return `Sent to leadership: ${n(p.deliverableId)}`;
    case 'createTask': return `Added: ${p.title}`;
    case 'completeTask': return `Completed: ${n(p.taskId)}`;
    case 'setClientPosition': return `${a.status === 'pending_approval' ? 'Asked to change' : 'Set'} the company position on the ${n(p.targetId).charAt(0).toLowerCase()}${n(p.targetId).slice(1)} to ${POSITION[p.stance as string]}`;
    case 'reopenSignal': return `Returned to the queue: ${n(p.signalId)}`;
    case 'logInteraction': return `Logged a ${p.kind} with ${(p.participantIds as string[] ?? []).map(n).join(', ')}`;
    case 'assessStakeholder': return `Updated the stance of ${n(p.subjectId)}: ${String(p.stance)}`;
    case 'addRiskOpportunity': return `${a.role === 'agent' ? 'Proposed' : 'Added'} a ${p.kind}: ${p.title}`;
    case 'updateStrategy': return `Updated the strategy on ${n(p.issueId)}`;
    case 'updateBillStage': return `Recorded a stage change on ${n(p.billId)}`;
    case 'reviewEvidence': return `${p.verdict === 'accept' ? 'Accepted' : 'Rejected'} a source: ${n(p.evidenceId)}`;
    case 'linkEvidence': return `Linked ${n(p.from)} to ${n(p.to)}`;
    case 'updateMonitoringProfile': return `Updated the monitoring settings: ${Object.keys(p).filter((k) => k !== 'clientId').map((k) => (k === 'agencies' ? 'ministries and agencies' : k)).join(', ')}`;
    case 'startPilot': return `Started a trial: ${p.title}`;
    case 'setPilotCriteria': return `Changed the targets of ${n(p.pilotId)}`;
    case 'addExpectedItem': return `Added to the must-catch list: ${p.title}`;
    case 'markRelevance': return `Marked ${p.relevance}: ${n(p.signalId)}`;
    case 'closePilot': return `Closed ${n(p.pilotId)}`;
    default: return pretty(a.action);
  }
}

const STEP: Record<string, string> = {
  'query.signals': 'Read new items', proposeTriage: 'Sort new items', triageSignal: 'File clear matches', whatChanged: 'Check what changed',
  responseLevel: 'Rank followed bills', stageGates: 'Find who decides next', raiseDecision: 'Raise a decision', addRiskOpportunity: 'Propose a risk',
  upcomingDeadlines: 'List deadlines', issueExposure: 'Rank issues', 'llm.complete': 'Write the summary', draftDeliverable: 'Draft the weekly report',
  submitForReview: 'Send for review', stop: 'Stop for approval',
};

const FILTERS = [['all', 'Everything'], ['people', 'People'], ['agent', 'Assistant'], ['system', 'Collector']] as const;

/**
 * One record of every change to the company's data, by the team, the rule-based assistant or the collector, with who
 * approved it. The assistant's weekly run is part of it; its working steps open under the run.
 */
export function AuditLog({ app }: { app: App }) {
  const [filter, setFilter] = useState<string>('all');
  const [steps, setSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = app.runs[app.clientId];
  const all = app.store.auditEntries(app.ctx);
  // A request that waited for approval shows its outcome on its own row; the entry written when it was decided is folded in.
  const outcome = new Map(all.filter((x) => x.pendingId && x.status !== 'pending_approval').map((x) => [x.pendingId!, x]));
  const keep = (x: AuditEntry) => filter === 'all' || (filter === 'people' ? ['consultant', 'principal'].includes(x.role) : x.role === filter);
  const entries = all.filter((x) => !(x.pendingId && x.status !== 'pending_approval')).filter(keep).reverse();
  const go = async () => {
    setBusy(true);
    await app.runAgent();
    setBusy(false);
  };
  return (
    <div className="page">
      <h1 className="headline">Audit log</h1>
      <p className="sub">Every change goes through a typed action and lands here: who did it, what changed, and who approved it. The assistant is rule-based, with no language model in this demo.</p>
      <div className="row">
        <Button intent="primary" loading={busy} text="Run the weekly assistant" onClick={go} />
        {run && <span className="sub">Last run: week of {md(run.since)} to {md(run.asOf)}, {run.steps.length} steps, stopped where a person has to approve</span>}
        {run && <Button size="small" variant="minimal" text={steps ? 'Hide the steps' : 'Show the steps'} onClick={() => setSteps(!steps)} />}
      </div>
      {run && steps && (
        <ol className="run">
          {run.steps.map((x) => (
            <li key={x.n} className={x.kind === 'gate' ? 'gate' : x.kind === 'action' ? 'action' : ''}>
              <div className="run-head"><b>{STEP[x.name] ?? pretty(x.name)}</b></div>
              <div className="sub">{prose(x.output)}</div>
            </li>
          ))}
        </ol>
      )}
      <nav className="seg" aria-label="Who">
        {FILTERS.map(([id, label]) => <button key={id} className={filter === id ? 'on' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
      </nav>
      {!entries.length && <Empty>Nothing recorded.</Empty>}
      <div className="table-wrap">
        <table className="tbl log">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Result</th><th>Approved by</th></tr></thead>
          <tbody>
            {entries.map((x) => {
              const done = x.status === 'pending_approval' ? outcome.get(x.pendingId!) : undefined;
              return (
                <tr key={x.id}>
                  <td className="nowrap sub">{app.when(x)}</td>
                  <td className="nowrap">{WHO[x.role]}</td>
                  <td>{prose(describe(app, x))}</td>
                  <td className="nowrap">{done ? (done.status === 'executed' ? 'Approved' : 'Declined') : RESULT[x.status]}{x.error && <div className="sub">{x.error.replace(/^[A-Z_]+: /, '')}</div>}</td>
                  <td className="nowrap">{done ? <>{person(done.approvedBy)}<div className="sub">{app.when(done)}</div></> : person(x.approvedBy)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Ontology ----------------
const ROLE: Record<string, string> = WHO;
// The schema names the roles 'principal' and 'consultant'; on screen they are the head of government affairs and the analyst.
const lead = (s: string) => s.replace(/\bprincipal\b/g, 'head of government affairs').replace(/\bPrincipal\b/g, 'Head of government affairs')
  .replace(/\bconsultants?\b/g, 'analyst').replace(/\bConsultants?\b/g, 'Analyst');

export function Ontology() {
  const objs = OBJECT_TYPE_NAMES.map((n) => [n, objectTypes[n] as ObjectTypeDef] as const);
  return (
    <div className="page">
      <h1 className="headline">Ontology</h1>
      <dl className="kv terms">
        <div><dt>{objs.length} object types</dt><dd>The things the team works with: bills, lawmakers, meetings, the company's positions, decisions, tasks.</dd></div>
        <div><dt>{LINK_TYPE_NAMES.length} link types</dt><dd>How they connect: sponsors, sits on, on the agenda of. Public links need a source record behind them.</dd></div>
        <div><dt>{ACTION_NAMES.length} action types</dt><dd>The only way data changes. Each says who may run it, whether it needs approval, and what it writes to the audit log.</dd></div>
        <div><dt>{functionTypes.length} functions</dt><dd>The judgments the screens show, computed from the objects and links: response level, who decides next, risk.</dd></div>
      </dl>
      {(['public', 'client'] as const).map((layer) => (
        <Section key={layer} title={layer === 'public' ? 'Public layer' : 'Confidential company layer'}>
          <div className="types">
            {objs.filter(([, d]) => d.layer === layer).map(([n, d]) => (
              <div key={n} className="type">
                <div className="type-name"><code>{n}</code></div>
                <p className="sub">{lead(d.description)}</p>
                <div className="props">{Object.keys(d.properties).join(' · ')}</div>
              </div>
            ))}
          </div>
        </Section>
      ))}
      <Section title="Link types">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Link</th><th>From</th><th>To</th><th>Evidence</th></tr></thead>
            <tbody>
              {LINK_TYPE_NAMES.map((n) => {
                const d = linkTypes[n] as LinkTypeDef;
                return <tr key={n}><td><code>{n}</code></td><td>{d.from.join(', ')}</td><td>{d.to.join(', ')}</td><td>{d.evidenceRequired ? 'Required' : 'Not required'}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Action types">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Action</th><th>What it does</th><th>Who can run it</th><th>Approval</th></tr></thead>
            <tbody>
              {ACTION_NAMES.map((n) => {
                const d = actionTypes[n] as ActionTypeDef;
                return (
                  <tr key={n}>
                    <td><code>{n}</code></td>
                    <td>{lead(d.description)}</td>
                    <td>{ROLES.filter((r) => d.allowedRoles.includes(r)).map((r) => ROLE[r]).join(', ')}</td>
                    <td>{d.requiresApproval ? `${cap(ROLE[d.approverRole!])} approves` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Functions">
        {functionTypes.map((f) => (
          <div key={f.name} className="item"><code>{f.signature}</code><p className="sub">{f.description}</p></div>
        ))}
      </Section>
    </div>
  );
}

