// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Settings: what we watch for the client (objectives, keywords, coverage) and the trial the client runs to test it.
import { useState } from 'react';
import { Button, HTMLSelect, InputGroup, Switch } from '@blueprintjs/core';
import { addDays, pilotMetrics, SOURCE_TYPES } from '../../ontology/index.ts';
import type { ObjectRecord, PilotMetrics, ProfileKeyword, ProfileObjective } from '../../ontology/index.ts';
import { Empty, ObjLink, SOURCE, T, cap, md, nameOf } from './ui.tsx';
import type { App } from './ui.tsx';
import { LIVE, liveReach } from './live.tsx';

const TABS = [['objectives', 'Objectives'], ['keywords', 'Keywords'], ['coverage', 'Coverage'], ['trial', 'Trial']] as const;
const SOURCE_LONG: Record<string, string> = { bill_update: 'Assembly bill tracker', minutes: 'Committee minutes', public_notice: 'Government notices', press_release: 'Press releases', news: 'News', seminar: 'Assembly seminars', ministry_press: 'Ministry press releases', gazette: 'Official Gazette' };
const PRIORITY: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function Settings({ app, tab }: { app: App; tab?: string }) {
  const { view, clientId } = app;
  const on = TABS.some(([id]) => id === tab) ? tab! : 'objectives';
  const profile = view.list('MonitoringProfile', (p) => p.clientId === clientId)[0];
  return (
    <div className="page">
      <h1 className="headline">What we watch for {app.client.name}</h1>
      <nav className="seg" aria-label="Settings">
        {TABS.map(([id, label]) => <button key={id} className={on === id ? 'on' : ''} aria-current={on === id ? 'page' : undefined} onClick={() => app.go(`settings/${id}`)}>{label}</button>)}
      </nav>
      {on !== 'trial' && !profile && <Empty>No monitoring settings yet.</Empty>}
      {on === 'objectives' && profile && <Objectives app={app} profile={profile} />}
      {on === 'keywords' && profile && <Keywords app={app} profile={profile} />}
      {on === 'coverage' && profile && <Coverage app={app} profile={profile} />}
      {on === 'trial' && <Trial app={app} hasProfile={!!profile} />}
    </div>
  );
}

const SaveBar = ({ dirty, onSave, onDiscard }: { dirty: boolean; onSave: () => void; onDiscard: () => void }) => (
  <div className="row save-bar">
    <Button intent="primary" text="Save changes" disabled={!dirty} onClick={onSave} />
    {dirty && <Button variant="minimal" text="Discard" onClick={onDiscard} />}
  </div>
);

// ---------------- Objectives ----------------
const byPriority = (os: ProfileObjective[]) => [...os].sort((a, b) => a.priority - b.priority);

function Objectives({ app, profile }: { app: App; profile: ObjectRecord }) {
  const saved = byPriority(profile.objectives);
  const [rows, setRows] = useState<ProfileObjective[]>(saved);
  const [text, setText] = useState('');
  const [priority, setPriority] = useState(2);
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  const set = (i: number, patch: Partial<ProfileObjective>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    const j = i + d;
    [next[i], next[j]] = [next[j], next[i]];
    // Moving past an item of another priority takes that priority, so the order survives the sort on save.
    const passed = next[i].priority;
    next[j] = { ...next[j], priority: d < 0 ? Math.min(next[j].priority, passed) : Math.max(next[j].priority, passed) };
    setRows(next);
  };
  const save = () => {
    const clean = byPriority(rows.map((r) => ({ ...r, text: r.text.trim() })).filter((r) => r.text));
    if (app.act('updateMonitoringProfile', { clientId: app.clientId, objectives: clean }, 'Objectives saved.')) setRows(clean);
  };
  return (
    <section className="sec">
      <h2 className="label">Strategic objectives</h2>
      {rows.map((o, i) => (
        <div key={i} className="item obj">
          <HTMLSelect value={o.priority} onChange={(e) => set(i, { priority: Number(e.target.value) })} options={[1, 2, 3].map((n) => ({ value: n, label: `Priority ${n}` }))} aria-label="Priority" />
          <InputGroup className="grow" value={o.text} onChange={(e) => set(i, { text: e.target.value })} aria-label="Objective" />
          <span className="row nowrap tight">
            <Button size="small" variant="minimal" text="Up" disabled={i === 0} onClick={() => move(i, -1)} />
            <Button size="small" variant="minimal" text="Down" disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
            <Button size="small" variant="minimal" text="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))} />
          </span>
        </div>
      ))}
      <div className="item obj add">
        <HTMLSelect value={priority} onChange={(e) => setPriority(Number(e.target.value))} options={[1, 2, 3].map((n) => ({ value: n, label: `Priority ${n}` }))} aria-label="Priority of the new objective" />
        <InputGroup className="grow" placeholder="New objective" value={text} onChange={(e) => setText(e.target.value)} aria-label="New objective" />
        <Button size="small" text="Add" disabled={!text.trim()} onClick={() => (setRows([...rows, { text: text.trim(), priority }]), setText(''))} />
      </div>
      <SaveBar dirty={dirty} onSave={save} onDiscard={() => setRows(saved)} />
    </section>
  );
}

// ---------------- Keywords ----------------
interface KwRow { term: string; priority: string; synonyms: string; exclude: string }
const toRow = (k: ProfileKeyword): KwRow => ({ term: k.term, priority: k.priority, synonyms: (k.synonyms ?? []).join(', '), exclude: (k.exclude ?? []).join(', ') });
const toKeyword = (r: KwRow) => ({ term: r.term.trim(), priority: r.priority, ...(list(r.synonyms).length ? { synonyms: list(r.synonyms) } : {}), ...(list(r.exclude).length ? { exclude: list(r.exclude) } : {}) });
const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function Keywords({ app, profile }: { app: App; profile: ObjectRecord }) {
  const saved = (profile.keywords as ProfileKeyword[]).map(toRow);
  const [rows, setRows] = useState<KwRow[]>(saved);
  const blank: KwRow = { term: '', priority: 'medium', synonyms: '', exclude: '' };
  const [draft, setDraft] = useState<KwRow>(blank);
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  const set = (i: number, patch: Partial<KwRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () => {
    const clean = rows.filter((r) => r.term.trim()).sort((a, b) => RANK[a.priority] - RANK[b.priority]);
    if (app.act('updateMonitoringProfile', { clientId: app.clientId, keywords: clean.map(toKeyword) }, 'Keywords saved.')) setRows(clean.map((r) => toRow(toKeyword(r) as ProfileKeyword)));
  };
  const fields = (r: KwRow, on: (p: Partial<KwRow>) => void, label: string) => (
    <>
      <InputGroup value={r.term} placeholder="Keyword" onChange={(e) => on({ term: e.target.value })} aria-label={`${label} keyword`} />
      <HTMLSelect value={r.priority} onChange={(e) => on({ priority: e.target.value })} options={Object.entries(PRIORITY).map(([value, l]) => ({ value, label: l }))} aria-label={`${label} priority`} />
      <InputGroup value={r.synonyms} placeholder="Also matches" onChange={(e) => on({ synonyms: e.target.value })} aria-label={`${label} also matches`} />
      <InputGroup value={r.exclude} placeholder="Ignore when it mentions" onChange={(e) => on({ exclude: e.target.value })} aria-label={`${label} ignore when it mentions`} />
    </>
  );
  return (
    <section className="sec">
      <h2 className="label">Keywords</h2>
      <div className="kw kw-head sub"><span>Keyword</span><span>Priority</span><span>Also matches</span><span>Ignore when it mentions</span><span /></div>
      {rows.map((r, i) => (
        <div key={i} className="kw">
          {fields(r, (p) => set(i, p), r.term || 'Row')}
          <Button size="small" variant="minimal" text="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="kw add">
        {fields(draft, (p) => setDraft({ ...draft, ...p }), 'New')}
        <Button size="small" text="Add" disabled={!draft.term.trim() || rows.some((r) => r.term.trim().toLowerCase() === draft.term.trim().toLowerCase())} onClick={() => (setRows([...rows, draft]), setDraft(blank))} />
      </div>
      <SaveBar dirty={dirty} onSave={save} onDiscard={() => setRows(saved)} />
    </section>
  );
}

// ---------------- Coverage ----------------
function Coverage({ app, profile }: { app: App; profile: ObjectRecord }) {
  const { view, clientId } = app;
  const toggle = (field: 'committees' | 'agencies' | 'sources', id: string, label: string) => {
    const cur: string[] = profile[field] ?? (field === 'sources' ? [...SOURCE_TYPES] : []);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    app.act('updateMonitoringProfile', { clientId, [field]: next }, `${label} ${cur.includes(id) ? 'removed from' : 'added to'} coverage.`);
  };
  const committees = view.list('Institution', (i) => i.kind === 'committee').sort((a, b) => a.name.localeCompare(b.name));
  const subs = (id: string) => view.list('Institution', (i) => i.kind === 'subcommittee' && i.parentId === id);
  const agencies = view.list('Institution', (i) => ['ministry', 'agency'].includes(i.kind)).sort((a, b) => a.name.localeCompare(b.name));
  const sources: string[] = profile.sources ?? [...SOURCE_TYPES];
  const sw = (field: 'committees' | 'agencies', o: ObjectRecord, label = o.name) => (
    <Switch key={o.id} checked={(profile[field] as string[]).includes(o.id)} label={label} onChange={() => toggle(field, o.id, o.name)} />
  );
  return (
    <div className="g2 cov">
      <section className="sec">
        <h2 className="label">Committees</h2>
        {committees.map((c) => (
          <div key={c.id} className="cov-group">
            {sw('committees', c)}
            <div className="cov-sub">{subs(c.id).map((s) => sw('committees', s, s.name.split(',')[0]))}</div>
          </div>
        ))}
      </section>
      <div>
        <section className="sec">
          <h2 className="label">Ministries and agencies</h2>
          {agencies.map((a) => sw('agencies', a))}
        </section>
        <section className="sec">
          <h2 className="label">Sources</h2>
          {SOURCE_TYPES.map((t) => <Switch key={t} checked={sources.includes(t)} label={SOURCE_LONG[t]} onChange={() => toggle('sources', t, SOURCE_LONG[t])} />)}
        </section>
      </div>
    </div>
  );
}

// ---------------- Trial ----------------
function Trial({ app, hasProfile }: { app: App; hasProfile: boolean }) {
  const { view, clientId } = app;
  const pilots = view.list('PilotEvaluation', (p) => p.clientId === clientId).sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || b.from.localeCompare(a.from));
  const pilot = pilots[0];
  if (!pilot) return hasProfile ? <StartTrial app={app} /> : <Empty>Set objectives and keywords before starting a trial.</Empty>;
  const m = pilotMetrics(view, pilot.id, liveReach());
  return (
    <>
      <TrialResult app={app} pilot={pilot} m={m} />
      <MustCatch app={app} pilot={pilot} m={m} />
      <Caught app={app} pilot={pilot} m={m} />
      {pilot.status === 'open'
        ? <div className="row save-bar"><Button text="Close the trial" onClick={() => app.act('closePilot', { pilotId: pilot.id }, m.pass ? 'Trial closed. It passed.' : 'Trial closed. It did not pass.')} /></div>
        : <StartTrial app={app} />}
    </>
  );
}

function shortfall(m: PilotMetrics): string {
  const gaps = [
    !m.checks.access && `${count(m.access.total - m.access.reached, 'source')} could not be reached`,
    !m.checks.misses && `${count(m.officialMisses, 'Assembly or government item')} ${m.officialMisses === 1 ? 'was' : 'were'} missed`,
    !m.checks.noise && `${pct(m.noiseRate)} of judged items were irrelevant`,
  ].filter(Boolean) as string[];
  return gaps.length ? `${cap(gaps.join('; '))}.` : 'All three targets met.';
}

function TrialResult({ app, pilot, m }: { app: App; pilot: ObjectRecord; m: PilotMetrics }) {
  const [editing, setEditing] = useState(false);
  const [access, setAccess] = useState(String(Math.round(m.criteria.access * 100)));
  const [misses, setMisses] = useState(String(m.criteria.officialMisses));
  const [noise, setNoise] = useState(String(Math.round(m.criteria.noise * 100)));
  const open = pilot.status === 'open';
  const met = (ok: boolean) => <T tone={ok ? 'op' : 'hi'}>{ok ? 'Met' : 'Not met'}</T>;
  const save = () => {
    const ok = app.act('setPilotCriteria', { pilotId: pilot.id, access: Number(access) / 100, officialMisses: Number(misses), noise: Number(noise) / 100 }, 'Targets updated.');
    if (ok) setEditing(false);
  };
  const lag = m.lagMedianDays;
  return (
    <section className="sec">
      <div className="row">
        <h2 className="h2">{pilot.title}</h2>
        <T tone={open ? 'md' : pilot.result === 'pass' ? 'op' : 'hi'}>{open ? (pilot.to < app.view.baseDate ? `Ended ${md(pilot.to)}, not closed` : 'In progress') : pilot.result === 'pass' ? 'Passed' : 'Did not pass'}</T>
      </div>
      <p className="sub">{md(pilot.from)} to {md(pilot.to)} · {count(m.expected, 'must-catch item')} · {count(m.caught, 'item')} caught</p>
      <p className="lead">{shortfall(m)}</p>
      <div className="stats">
        <div className="stat">
          <div className="stat-name">Sources reached</div>
          <div className="stat-value">{m.access.reached} of {m.access.total}</div>
          <div className="sub">Target {pct(m.criteria.access)}{LIVE ? ` · live sources checked for ${md(LIVE.from)} to ${md(LIVE.to)}` : ''}</div>
          {met(m.checks.access)}
        </div>
        <div className="stat">
          <div className="stat-name">Missed items</div>
          <div className="stat-value">{m.missed.length} of {m.expected}</div>
          <div className="sub">{m.officialMisses} from the Assembly or government · target {m.criteria.officialMisses}</div>
          {met(m.checks.misses)}
        </div>
        <div className="stat">
          <div className="stat-name">Irrelevant items</div>
          <div className="stat-value">{pct(m.noiseRate)}</div>
          <div className="sub">{m.irrelevant} of {m.judged} judged · target {pct(m.criteria.noise)} or less</div>
          {met(m.checks.noise)}
        </div>
        <div className="stat">
          <div className="stat-name">Time to detect</div>
          <div className="stat-value">{lag === null ? 'None found' : `${lag} ${lag === 1 ? 'day' : 'days'}`}</div>
          <div className="sub">Median, publication to alert</div>
        </div>
      </div>
      {open && !editing && <div className="row"><Button size="small" variant="minimal" text="Change targets" onClick={() => setEditing(true)} /></div>}
      {open && editing && (
        <div className="row targets">
          <label>Sources reached, % <InputGroup type="number" min={0} max={100} value={access} onChange={(e) => setAccess(e.target.value)} /></label>
          <label>Missed Assembly or government items <InputGroup type="number" min={0} value={misses} onChange={(e) => setMisses(e.target.value)} /></label>
          <label>Irrelevant items, % at most <InputGroup type="number" min={0} max={100} value={noise} onChange={(e) => setNoise(e.target.value)} /></label>
          <Button size="small" intent="primary" text="Save" onClick={save} />
          <Button size="small" variant="minimal" text="Cancel" onClick={() => setEditing(false)} />
        </div>
      )}
      <h3 className="label">By source</h3>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Source</th><th>Reached</th><th>Must-catch</th><th>Missed</th><th>Caught</th><th>Irrelevant</th></tr></thead>
          <tbody>
            {m.bySource.map((r) => (
              <tr key={r.sourceType}>
                <td>{SOURCE_LONG[r.sourceType]}</td><td>{r.reached ? 'Yes' : 'No'}</td><td>{r.expected}</td>
                <td className={r.missed ? 'warn' : ''}>{r.missed}</td><td>{r.caught}</td><td>{r.irrelevant}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {m.missed.length > 0 && <>
        <h3 className="label">Missed</h3>
        {m.missed.map((e) => (
          <div key={e.id} className="item">
            <div className="item-title">{e.title}</div>
            <div className="sub">{SOURCE[e.sourceType]} · published {md(e.date)}</div>
          </div>
        ))}
      </>}
    </section>
  );
}

function MustCatch({ app, pilot, m }: { app: App; pilot: ObjectRecord; m: PilotMetrics }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [date, setDate] = useState(pilot.from as string);
  const [sourceType, setSourceType] = useState('press_release');
  const found = new Map(m.matches.map((x) => [x.expectedId, x]));
  const add = () => {
    const ok = app.act('addExpectedItem', { pilotId: pilot.id, title: title.trim(), ...(url.trim() ? { url: url.trim() } : {}), date, sourceType }, 'Added to the must-catch list.');
    if (ok) (setTitle(''), setUrl(''));
  };
  return (
    <section className="sec">
      <h2 className="label">Must-catch list from {app.client.name}</h2>
      {!(pilot.expected as unknown[]).length && <Empty>No items listed yet.</Empty>}
      {(pilot.expected as { id: string; title: string; date: string; sourceType: string }[]).map((e) => {
        const f = found.get(e.id);
        return (
          <div key={e.id} className="item news">
            <div className="grow">
              <div>{e.title}</div>
              <div className="sub">{SOURCE[e.sourceType]} · published {md(e.date)}{f ? ` · caught ${md(getSig(app, f.signalId)?.collectedAt)}` : ''}</div>
            </div>
            <T tone={f ? 'op' : 'hi'}>{f ? 'Caught' : 'Missed'}</T>
          </div>
        );
      })}
      {pilot.status === 'open' && (
        <div className="add-form">
          <InputGroup className="grow" placeholder="Headline" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Headline" />
          <InputGroup className="grow" placeholder="Link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link" />
          <InputGroup type="date" value={date} min={pilot.from} max={pilot.to} onChange={(e) => setDate(e.target.value)} aria-label="Published" />
          <HTMLSelect value={sourceType} onChange={(e) => setSourceType(e.target.value)} options={SOURCE_TYPES.map((t) => ({ value: t, label: SOURCE[t] }))} aria-label="Source" />
          <Button text="Add" disabled={!title.trim() || !date} onClick={add} />
        </div>
      )}
    </section>
  );
}

const getSig = (app: App, id: string) => app.view.get(id);

function Caught({ app, pilot, m }: { app: App; pilot: ObjectRecord; m: PilotMetrics }) {
  const listed = new Set(m.matches.map((x) => x.signalId));
  const open = pilot.status === 'open';
  const mark = (signalId: string, relevance: 'relevant' | 'irrelevant') => app.act('markRelevance', { pilotId: pilot.id, signalId, relevance }, relevance === 'relevant' ? 'Marked relevant.' : 'Marked irrelevant.');
  return (
    <section className="sec">
      <h2 className="label">Caught in the window{m.unreviewed ? ` · ${m.unreviewed} to review` : ''}</h2>
      {(pilot.caught as { signalId: string }[]).map(({ signalId }) => {
        const s = getSig(app, signalId);
        if (!s) return null;
        const call = m.relevance[signalId];
        return (
          <div key={signalId} className="item confirm">
            <div className="grow">
              <div className="item-title"><ObjLink id={signalId} app={app} label={nameOf(s)} /></div>
              <div className="sub">{SOURCE[s.sourceType]} · {md(s.collectedAt)}{listed.has(signalId) ? ' · on the must-catch list' : ''}</div>
            </div>
            {open
              ? <div className="row nowrap tight">
                  <Button size="small" text="Relevant" active={call === 'relevant'} onClick={() => mark(signalId, 'relevant')} />
                  <Button size="small" text="Irrelevant" active={call === 'irrelevant'} onClick={() => mark(signalId, 'irrelevant')} />
                </div>
              : call && <T tone={call === 'relevant' ? 'op' : 'plain'}>{cap(call)}</T>}
          </div>
        );
      })}
    </section>
  );
}

function StartTrial({ app }: { app: App }) {
  const base = app.view.baseDate;
  const [title, setTitle] = useState('Two-week trial');
  const [from, setFrom] = useState(addDays(base, -14));
  const [to, setTo] = useState(addDays(base, -1));
  return (
    <section className="sec">
      <h2 className="label">Start a trial</h2>
      <div className="add-form">
        <InputGroup className="grow" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Trial name" />
        <InputGroup type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <InputGroup type="date" value={to} min={from} max={base} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <Button intent="primary" text="Start" disabled={!title.trim() || !from || !to} onClick={() => app.act('startPilot', { clientId: app.clientId, title: title.trim(), from, to }, 'Trial started.')} />
      </div>
    </section>
  );
}
