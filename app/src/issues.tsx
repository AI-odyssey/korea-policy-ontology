// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Issues & bills: the issues the team follows, then one bill's profile.
import { useState } from 'react';
import { Button, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { addDays, responseFacts, responseLevel, stageGates } from '../../ontology/index.ts';
import type { ObjectRecord, ResponseFacts } from '../../ontology/index.ts';
import { countWord, forumOf, subcommitteeName } from '../../agent/index.ts';
import { Empty, LEVEL, LEVEL3, ObjLink, POSITION, SOURCE, STAGE, Section, T, billName, cap, md } from './ui.tsx';
import type { App } from './ui.tsx';
import { PublicRecords } from './live.tsx';

const LEVEL_TONE: Record<string, 'hi' | 'md' | 'plain'> = { act_now: 'hi', engage: 'md', monitor: 'plain', watch: 'plain' };
const CLOSED = ['passed', 'merged_alternative', 'withdrawn'];
const GATE: Record<string, string> = { subcommittee: 'Subcommittee', committee: 'Full committee', lj: 'Legislation and Judiciary Committee', plenary: 'Plenary session' };
const TYPE: Record<string, string> = { lawmaker: 'Lawmaker bill', government: 'Government bill', committee_alternative: 'Committee alternative' };
const WANTS: Record<string, string> = { amend: 'wants it amended', oppose: 'opposes it', support: 'supports it', monitor: 'has no position on it' };

const positionOn = (app: App, ...ids: string[]) =>
  ids.map((id) => app.view.list('ClientPosition', (p) => p.clientId === app.clientId && p.targetId === id)[0]).find(Boolean);

/** The company's position on an issue: set on the issue itself, or else the position on the followed bill that matters most. */
function issuePosition(app: App, issueId: string, bills: ObjectRecord[], watched: Set<string>): { stance: string; bill?: ObjectRecord } {
  const own = positionOn(app, issueId);
  if (own) return { stance: own.stance };
  const rank = ['oppose', 'amend', 'support', 'monitor'];
  const onBills = bills.filter((b) => watched.has(b.id) && !CLOSED.includes(b.stage)).map((b) => ({ b, p: positionOn(app, b.id) })).filter((x) => x.p)
    .sort((x, y) => rank.indexOf(x.p!.stance) - rank.indexOf(y.p!.stance) || x.b.id.localeCompare(y.b.id));
  return onBills[0] ? { stance: onBills[0].p!.stance, bill: onBills[0].b } : { stance: 'monitor' };
}

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

  const allBills = new Set(issues.flatMap((i) => view.sources(i.id, 'about').filter((o) => o.type === 'Bill').map((o) => o.id))).size;

  return (
    <div className="page">
      <h1 className="headline">Issues and bills</h1>
      <p className="lead">{countWord(issues.length)} issues affect {app.client.name}. We follow {countWord(watchedBills.size).toLowerCase()} bills closely and list every bill on these issues below ({allBills} in all).</p>
      {issues.map((issue) => {
        const bills = view.sources(issue.id, 'about').filter((o) => o.type === 'Bill')
          .sort((a, b) => Number(watchedBills.has(b.id)) - Number(watchedBills.has(a.id)) || Number(CLOSED.includes(a.stage)) - Number(CLOSED.includes(b.stage)) || a.id.localeCompare(b.id));
        const pos = issuePosition(app, issue.id, bills, watchedBills);
        return (
          <Section key={issue.id} title={issue.title} className="issue">
            <div className="row">
              <T tone={impact.get(issue.id) === 'high' ? 'hi' : 'md'}>{LEVEL3[impact.get(issue.id)!]} impact</T>
              <T tone="navy">Company position: {POSITION[pos.stance]}</T>
              {pos.bill && <span className="sub nowrap">Position set on the {billName(pos.bill).toLowerCase()}.</span>}
              <span className="sub">{issue.summary}</span>
            </div>
            <div className="table-wrap">
              <table className="tbl bills">
                <colgroup><col className="c-bill" /><col className="c-stage" /><col className="c-resp" /><col className="c-next" /></colgroup>
                <thead><tr><th>Bill</th><th>Stage</th><th>Response level</th><th>Next step</th></tr></thead>
                <tbody>
                  {bills.map((b) => {
                    const closed = CLOSED.includes(b.stage);
                    const level = responseLevel(view, b.id, clientId, since).level;
                    const f = responseFacts(view, b.id, clientId, since);
                    return (
                      <tr key={b.id} className={closed ? 'closed' : ''}>
                        <td data-label="Bill"><ObjLink id={b.id} app={app} label={billName(b)} /> <span className="sub nowrap">{b.billNo ?? 'In notice'}</span></td>
                        <td data-label="Stage">{STAGE[b.stage]}</td>
                        <td data-label="Response level">{closed ? '' : <T tone={LEVEL_TONE[level]}>{LEVEL[level]}</T>}</td>
                        <td data-label="Next step">{nextStep(view, f)}</td>
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

/** The next dated step on a bill: its next meeting, or the close of its notice period, whichever comes first. */
function nextStep(view: App['view'], f: ResponseFacts): string {
  const notice = f.notice && (!f.slot || f.notice.date < f.slot.date);
  if (notice) return `Notice period closes, ${md(f.notice!.date)}`;
  return f.slot ? `${cap(forumOf(view, f.slot))}, ${md(f.slot.date)}` : '';
}

const days = (n: number) => `${countWord(n).toLowerCase()} day${n === 1 ? '' : 's'}`;

/** The facts behind the level, split into those that raise it and those that keep it from going higher. */
function levelReasons(app: App, bill: ObjectRecord, f: ResponseFacts, level: string, since: string, pos?: ObjectRecord): { up: string[]; down: string[] } {
  const { view, client } = app;
  const up: string[] = [];
  const down: string[] = [];
  if (f.change) up.push(`Stage update on ${md(f.change.date)}: ${STAGE[f.change.to]}.`);
  else down.push(`No change in stage since ${md(since)}.`);
  const near = (n?: number) => n !== undefined && n <= 30;
  if (near(f.daysToSlot)) up.push(`${cap(forumOf(view, f.slot!))} is scheduled to meet on ${md(f.slot!.date)}, in ${days(f.daysToSlot!)}.`);
  if (near(f.daysToNotice)) {
    const agency = view.sources(bill.id, 'sponsors').find((x) => x.type === 'Institution')?.kind === 'ministry' ? 'ministry' : 'agency';
    up.push(`The comment period on the legislative notice closes on ${md(f.notice!.date)}, in ${days(f.daysToNotice!)}. The ${agency} then finalizes the bill, which reaches the Assembly months later.`);
  }
  if (!near(f.daysToSlot) && !near(f.daysToNotice)) down.push('No meeting or notice deadline falls within the next 30 days.');
  else if (level !== 'act_now' && Math.min(f.daysToSlot ?? 99, f.daysToNotice ?? 99) > 7) down.push('The next step is more than seven days away.');
  const wants = pos && ['amend', 'oppose'].includes(pos.stance);
  const on = pos && pos.targetId !== bill.id ? ' (position set on the issue)' : '';
  if (wants) up.push(`${client.name} ${WANTS[pos!.stance]}${on}.`);
  else down.push(pos ? `${client.name} ${WANTS[pos.stance]}${on}.` : `${client.name} has no recorded position on this bill.`);
  if (!f.textOpen) down.push('The full committee has passed the text; only wording and delay risk remain.');
  if (f.slotKind === 'introduction') down.push('The next meeting is an introduction only; no vote is scheduled.');
  if (f.impact === 'high') up.push(`Impact on ${client.name} is high.`);
  else down.push(f.impact ? `Impact on ${client.name} is ${f.impact}.` : `No direct impact on ${client.name} is recorded.`);
  return { up, down };
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

  const reasons = levelReasons(app, bill, f, level, since, pos);

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
        {closed ? (
          <Section title="Status"><p>{STAGE[bill.stage]}{bill.mergedInto ? <> into the <ObjLink id={bill.mergedInto} app={app} /></> : ''}.</p></Section>
        ) : (
          <Section title={`Response level: ${LEVEL[level]}`}>
            <h3 className="label minor">Grounds for this level</h3>
            {reasons.up.length ? <ul className="plain">{reasons.up.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="sub">No factor on record calls for action on this bill.</p>}
            {level !== 'act_now' && reasons.down.length > 0 && <>
              <h3 className="label minor">Factors against a higher level</h3>
              <ul className="plain">{reasons.down.map((r) => <li key={r}>{r}</li>)}</ul>
            </>}
          </Section>
        )}
        <Section title="Company position">
          {pos ? (
            <div className="item">
              <div className="item-title"><T tone="navy">{POSITION[pos.stance]}</T>{pos.targetId !== bill.id && <span className="sub">set on the issue: {view.get(pos.targetId)?.title}</span>}</div>
              <p className="sub">{pos.rationale}</p>
            </div>
          ) : <div className="item"><div className="item-title"><T tone="navy">No position</T></div></div>}
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
              <span className="step-date">{g.date ? md(g.date) : 'Not scheduled'}</span>{g.key === 'subcommittee' ? cap(subcommitteeName(view, g.institutionId)) : GATE[g.key]}
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
