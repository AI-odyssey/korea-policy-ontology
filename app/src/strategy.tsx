// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Strategy: for each issue, the outcome we want, our position, messages, who to persuade, allies and the plan.
import { useState } from 'react';
import { Button, TextArea } from '@blueprintjs/core';
import type { ObjectRecord } from '../../ontology/index.ts';
import { OWNER } from '../../agent/index.ts';
import { Empty, LEVEL3, ObjLink, STANCE, T, md, nameOf } from './ui.tsx';
import type { App } from './ui.tsx';


export function Strategy({ app }: { app: App }) {
  const { view, clientId } = app;
  const impact = new Map(view.links({ type: 'affects', to: clientId }).map((l) => [l.from, l.props?.impact as string]));
  const order = ['high', 'medium', 'low'];
  const strategies = view.list('Strategy', (s) => s.clientId === clientId)
    .sort((a, b) => order.indexOf(impact.get(a.issueId)!) - order.indexOf(impact.get(b.issueId)!) || a.issueId.localeCompare(b.issueId));
  return (
    <div className="page">
      <h1 className="headline">Strategy</h1>
      <nav className="toc">{strategies.map((s) => <a key={s.id} href={`#strategy/${s.issueId}`} onClick={(e) => (e.preventDefault(), document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }))}>{view.get(s.issueId)?.title}</a>)}</nav>
      {!strategies.length && <Empty>No strategy written yet.</Empty>}
      {strategies.map((s) => <Plan key={s.id} app={app} s={s} impact={impact.get(s.issueId)} />)}
    </div>
  );
}

function Plan({ app, s, impact }: { app: App; s: ObjectRecord; impact?: string }) {
  const { view, clientId } = app;
  const issue = view.get(s.issueId)!;
  const pos = view.list('ClientPosition', (p) => p.clientId === clientId && p.targetId === s.issueId)[0]
    ?? view.list('ClientPosition', (p) => p.clientId === clientId && view.targets(p.targetId, 'about').some((i) => i.id === s.issueId))[0];
  const tasks = ((s.planTaskIds ?? []) as string[]).map((id) => view.get(id)).filter(Boolean) as ObjectRecord[];
  tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const [editing, setEditing] = useState(false);
  const [outcome, setOutcome] = useState(s.desiredOutcome as string);
  const [messages, setMessages] = useState((s.messages as string[]).join('\n'));
  const save = () => {
    const ok = app.act('updateStrategy', { clientId, issueId: s.issueId, desiredOutcome: outcome.trim(), messages: messages.split('\n').map((m) => m.trim()).filter(Boolean) }, 'Strategy updated.');
    if (ok) setEditing(false);
  };

  return (
    <section className="strategy" id={s.id}>
      <div className="row">
        <h2 className="h2">{issue.title}</h2>
        {impact && <T tone={impact === 'high' ? 'hi' : 'md'}>{LEVEL3[impact]} impact</T>}
      </div>
      <div className="g2">
        <div>
          <h3 className="label">Desired outcome</h3>
          {editing ? <TextArea fill autoResize value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Desired outcome" /> : <p className="outcome">{s.desiredOutcome}</p>}
          {pos && <>
            <h3 className="label">Company position</h3>
            <p className="sub">{pos.rationale}</p>
          </>}
          <h3 className="label">Key messages</h3>
          {editing ? <TextArea fill autoResize value={messages} onChange={(e) => setMessages(e.target.value)} aria-label="Key messages, one per line" />
            : <ol className="messages">{(s.messages as string[]).map((m) => <li key={m}>{m}</li>)}</ol>}
          <div className="row">
            {editing ? (
              <>
                <Button size="small" intent="primary" text="Save" disabled={!outcome.trim() || !messages.trim()} onClick={save} />
                <Button size="small" variant="minimal" text="Cancel" onClick={() => setEditing(false)} />
              </>
            ) : <Button size="small" text="Edit" onClick={() => setEditing(true)} />}
          </div>
        </div>
        <div>
          <h3 className="label">Who we need to persuade</h3>
          <div className="chips">
            {(s.targetIds as string[]).map((id) => view.get(id)).filter(Boolean).map((a) => (
              <button key={a!.id} className={`pp pp-${a!.stance}`} onClick={() => app.go(`stakeholders/${s.issueId}/${a!.subjectId}`)} title={STANCE[a!.stance]}>
                {nameOf(view.get(a!.subjectId))}
              </button>
            ))}
          </div>
          {(s.allyIds ?? []).length > 0 && <>
            <h3 className="label">Allies</h3>
            <div className="chips">{(s.allyIds as string[]).map((id) => <span key={id} className="pp"><ObjLink id={id} app={app} /></span>)}</div>
          </>}
          <h3 className="label">Plan</h3>
          {!tasks.length && <Empty>No steps yet.</Empty>}
          {tasks.map((t) => (
            <div key={t.id} className={`item plan ${t.status === 'done' ? 'done' : ''}`}>
              <span className="sub nowrap">{md(t.dueDate)}</span>
              <span className="grow">{t.title}</span>
              <span className="sub nowrap">{OWNER[t.owner]}{t.status === 'done' ? ' · Done' : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
