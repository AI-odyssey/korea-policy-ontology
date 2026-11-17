// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Issues & bills: the issues this engagement follows, then one bill's profile.
import { useState } from 'react';
import { Button, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { addDays, responseFacts, responseLevel, stageGates } from '../../ontology/index.ts';
import type { ObjectRecord } from '../../ontology/index.ts';
import { countWord, forumOf } from '../../agent/index.ts';
import { Empty, LEVEL, LEVEL3, ObjLink, POSITION, SOURCE, STAGE, Section, T, billName, cap, md } from './ui.tsx';
import type { App } from './ui.tsx';
import { PublicRecords } from './live.tsx';

const LEVEL_TONE: Record<string, 'hi' | 'md' | 'plain'> = { act_now: 'hi', engage: 'md', monitor: 'plain', watch: 'plain' };
const CLOSED = ['passed', 'merged_alternative', 'withdrawn'];
const GATE: Record<string, string> = { subcommittee: 'Bill review subcommittee', committee: 'Full committee', lj: 'Legislation and Judiciary Committee', plenary: 'Plenary session' };
const TYPE: Record<string, string> = { lawmaker: 'Lawmaker bill', government: 'Government bill', committee_alternative: 'Committee alternative' };
const WANTS: Record<string, string> = { amend: 'wants it amended', oppose: 'opposes it', support: 'supports it', monitor: 'is watching it' };

const positionOn = (app: App, ...ids: string[]) =>
  ids.map((id) => app.view.list('ClientPosition', (p) => p.clientId === app.clientId && p.targetId === id)[0]).find(Boolean);

export function Issues({ app, billId }: { app: App; billId?: string }) {
  const bill = billId ? app.view.get(billId) : undefined;
  return bill?.type === 'Bill' ? <BillProfile app={app} bill={bill} /> : <IssueList app={app} />;
}

function IssueList({ app }: { app: App }) {
  const { view, clientId } = app;
  const since = addDays(view.baseDate, -7);
  const impact = new Map(view.links({ type: 'affects', to: clientId }).map((l) => [l.from, l.props?.impact as string]));
  const eng = view.list('Engagement', (e) => e.clientId === clientId)[0];
  const watchedBills = new Set(eng ? view.targets(eng.id, 'watches').filter((o) => o.type === 'Bill').map((o) => o.id) : []);
  const issues = view.sources(clientId, 'affects').sort((a, b) => ['high', 'medium', 'low'].indexOf(impact.get(a.id)!) - ['high', 'medium', 'low'].indexOf(impact.get(b.id)!) || a.id.localeCompare(b.id));

  return (
    <div className="page">
      <h1 className="headline">Issues and bills</h1>
      <p className="lead">{countWord(issues.length)} issues affect {app.client.name}. We follow {countWord(watchedBills.size).toLowerCase()} bills closely.</p>
      {issues.map((issue) => {
        const pos = positionOn(app, issue.id);
        const bills = view.sources(issue.id, 'about').filter((o) => o.type === 'Bill')
          .sort((a, b) => Number(watchedBills.has(b.id)) - Number(watchedBills.has(a.id)) || Number(CLOSED.includes(a.stage)) - Number(CLOSED.includes(b.stage)) || a.id.localeCompare(b.id));
        return (
          <Section key={issue.id} title={issue.title} className="issue">
            <div className="row">
              <T tone={impact.get(issue.id) === 'high' ? 'hi' : 'md'}>{LEVEL3[impact.get(issue.id)!]} impact</T>
              {pos && <T tone="navy">Client position: {POSITION[pos.stance]}</T>}
              <span className="sub">{issue.summary}</span>
            </div>
            <div className="table-wrap">
              <table className="tbl bills">
                <colgroup><col className="c-bill" /><col className="c-stage" /><col className="c-resp" /><col className="c-next" /></colgroup>
                <thead><tr><th>Bill</th><th>Stage</th><th>Response level</th><th>Next meeting</th></tr></thead>
                <tbody>
                  {bills.map((b) => {
                    const closed = CLOSED.includes(b.stage);
                    const level = responseLevel(view, b.id, clientId, since).level;
                    const f = responseFacts(view, b.id, clientId, since);
                    return (
                      <tr key={b.id} className={closed ? 'closed' : ''}>
                        <td><ObjLink id={b.id} app={app} label={billName(b)} /> <span className="sub nowrap">{b.billNo ?? 'In notice'}</span></td>
                        <td>{STAGE[b.stage]}</td>
                        <td>{closed ? '' : <T tone={LEVEL_TONE[level]}>{LEVEL[level]}</T>}</td>
                        <td>{f.slot ? `${cap(forumOf(view, f.slot))}, ${md(f.slot.date)}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })}
      <PublicRecords app={app} limit={12} filters />
    </div>
  );
}

function BillProfile({ app, bill }: { app: App; bill: ObjectRecord }) {
  const { view, clientId, client } = app;
  const since = addDays(view.baseDate, -7);
  const issues = view.targets(bill.id, 'about');
  const level = responseLevel(view, bill.id, clientId, since).level;
  const f = responseFacts(view, bill.id, clientId, since);
  const pos = positionOn(app, bill.id, ...issues.map((i) => i.id));
  const sponsor = view.sources(bill.id, 'sponsors')[0];
  const gates = stageGates(view, bill.id).filter((g) => g.status === 'next' || g.status === 'later');
  const history = bill.stageHistory as { stage: string; date: string }[];
  const news = view.sources(bill.id, 'mentions').sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)).slice(0, 6);
  const closed = CLOSED.includes(bill.stage);
  const [editing, setEditing] = useState(false);
  const [stance, setStance] = useState(pos?.stance ?? 'monitor');
  const [why, setWhy] = useState('');

  const reasons = [
    f.change ? `${STAGE[f.change.to]} on ${md(f.change.date)}.` : 'No change in stage this week.',
    f.slot ? `${cap(forumOf(view, f.slot))} meets ${md(f.slot.date)}, in ${countWord(f.daysToSlot!).toLowerCase()} day${f.daysToSlot === 1 ? '' : 's'}.` : 'No meeting scheduled in the next 30 days.',
    pos ? `${client.name} ${WANTS[pos.stance]}${pos.targetId === bill.id ? '' : ' (position on the issue)'}.` : 'No client position set.',
    f.impact ? `${cap(f.impact)} impact on ${client.name}.` : `No direct impact on ${client.name}.`,
  ];

  return (
    <div className="page">
      <a className="back" onClick={() => app.go('issues')}>All issues and bills</a>
      <h1 className="headline">{billName(bill)}</h1>
      <p className="sub">{[bill.title, bill.billNo ?? 'No bill number until submitted', `${TYPE[bill.billType]}${sponsor ? `, proposed by ${sponsor.name}` : ''}`].join(' · ')}</p>
      <div className="row">
        <T tone="navy">{STAGE[bill.stage]}</T>
        {!closed && <T tone={LEVEL_TONE[level]}>{LEVEL[level]}</T>}
        {issues.map((i) => <span key={i.id} className="sub">{i.title}</span>)}
      </div>
      <p className="lead">{bill.summary}</p>

      <div className="g2">
        <Section title={closed ? 'Status' : `Why ${LEVEL[level].toLowerCase()}`}>
          {closed ? <p>{STAGE[bill.stage]}{bill.mergedInto ? <> into the <ObjLink id={bill.mergedInto} app={app} /></> : ''}.</p> : <ul className="plain">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </Section>
        <Section title="Client position">
          {pos ? (
            <div className="item">
              <div className="item-title"><T tone="navy">{POSITION[pos.stance]}</T>{pos.targetId !== bill.id && <span className="sub">on the issue: {view.get(pos.targetId)?.title}</span>}</div>
              <p className="sub">{pos.rationale}</p>
            </div>
          ) : <Empty>No position set.</Empty>}
          {!editing ? <Button size="small" text="Change position" onClick={() => setEditing(true)} /> : (
            <div className="row">
              <HTMLSelect value={stance} onChange={(e) => setStance(e.target.value)} options={Object.entries(POSITION).map(([value, label]) => ({ value, label }))} aria-label="Position" />
              <InputGroup size="small" placeholder="Reason" value={why} onChange={(e) => setWhy(e.target.value)} className="grow" />
              <Button size="small" intent="primary" text="Save" disabled={!why.trim()} onClick={() => app.act('setClientPosition', { clientId, targetId: bill.id, stance, rationale: why }, 'Position saved.') && (setEditing(false), setWhy(''))} />
              <Button size="small" variant="minimal" text="Cancel" onClick={() => setEditing(false)} />
            </div>
          )}
        </Section>
      </div>

      <Section title="Stages">
        <ol className="steps">
          {history.map((h, i) => <li key={i} className="done"><span className="step-date">{md(h.date)}</span>{STAGE[h.stage]}</li>)}
          {gates.map((g) => (
            <li key={g.key} className={g.status}>
              <span className="step-date">{g.date ? md(g.date) : 'Not scheduled'}</span>{GATE[g.key]}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Latest news and records">
        {!news.length && <Empty>Nothing collected yet.</Empty>}
        {news.map((s) => (
          <div key={s.id} className="item news">
            <span className="sub nowrap">{md(s.collectedAt)} · {SOURCE[s.sourceType]}</span>
            <ObjLink id={s.id} app={app} label={s.title} />
          </div>
        ))}
      </Section>
    </div>
  );
}
