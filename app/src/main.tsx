// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// App shell: one in-memory Store persisted to localStorage. The viewer is the engagement lead for one client:
// they see the public record plus that client's confidential layer, and they approve what the assistant proposes.
import { StrictMode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, HTMLSelect } from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import './styles.css';
import worldJson from '../../data/world.json';
import { Store, clientMarking } from '../../ontology/index.ts';
import type { ActionName, Ctx, World } from '../../ontology/index.ts';
import { openWeek, refreshWeeklyReport, runWeeklyAgent } from '../../agent/index.ts';
import type { AgentRun } from '../../agent/index.ts';
import { MarkTag, ObjectDrawer, md } from './ui.tsx';
import type { App, Tone } from './ui.tsx';
import { ThisWeek } from './week.tsx';
import { Issues } from './issues.tsx';
import { Stakeholders } from './stakeholders.tsx';
import { Strategy } from './strategy.tsx';
import { ActivityLog, AssistantRun, Ontology, Reports } from './more.tsx';
import { Settings } from './settings.tsx';

const world = worldJson as unknown as World;
const STATE_KEY = `kpo-demo-state-v5-${world.meta.seed}`;
const RUNS_KEY = `kpo-demo-runs-v5-${world.meta.seed}`;
const PREFS_KEY = 'kpo-demo-prefs-v3';
const CLIENT_IDS = world.objects.filter((o) => o.type === 'Client').map((o) => o.id);
const COLOPHON = `© 2026 AI-odyssey · korea-policy-ontology · build ${__BUILD_HASH__}`;

// Storage can be missing or full (private mode, quotas); the demo must still run without it.
const read = <T,>(key: string): T | undefined => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};
const loadStore = (): Store => {
  try {
    const snap = read<ReturnType<Store['snapshot']>>(STATE_KEY);
    if (snap) return Store.fromSnapshot(snap);
  } catch {
    /* corrupt snapshot: start fresh */
  }
  return new Store(world);
};

const LEFT = [['week', 'This week'], ['issues', 'Issues & bills'], ['stakeholders', 'Stakeholders'], ['strategy', 'Strategy']] as const;
const RIGHT = [['reports', 'Reports'], ['activity', 'Activity log'], ['assistant', 'Assistant run'], ['settings', 'Settings'], ['ontology', 'Ontology']] as const;
const SCREENS: string[] = [...LEFT, ...RIGHT].map(([id]) => id);

const parseHash = () => {
  const [screen, ...rest] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { screen: SCREENS.includes(screen) ? screen : 'week', rest: rest.join('/') || undefined };
};

// When the demo opens it is Monday morning: the weekly assistant has filed clear matches, raised decisions and drafted
// reports for each client, and a consultant has asked for a position change. All of it waits for the engagement lead.
const primed = new WeakSet<Store>();
async function prime(store: Store): Promise<Record<string, AgentRun>> {
  if (primed.has(store) || store.auditEntries({ actor: 'x', role: 'principal', clientIds: CLIENT_IDS }).length) return {};
  primed.add(store);
  return openWeek(store, CLIENT_IDS);
}

function Root() {
  const clients = useMemo(() => world.objects.filter((o) => o.type === 'Client').sort((a, b) => a.name.localeCompare(b.name)), []);
  const [store, setStore] = useState(loadStore);
  const [clientId, setClientId] = useState<string>(() => read<{ clientId: string }>(PREFS_KEY)?.clientId ?? clients[0].id);
  const [route, setRoute] = useState(parseHash);
  const [inspectId, setInspect] = useState<string>();
  const [notice, setNotice] = useState<{ msg: string; tone: Tone }>();
  const [runs, setRuns] = useState<Record<string, AgentRun>>(() => read(RUNS_KEY) ?? {});
  const version = useSyncExternalStore((cb) => store.subscribe(cb), () => store.version);

  useEffect(() => {
    const on = () => (setRoute(parseHash()), setInspect(undefined), window.scrollTo(0, 0));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => write(PREFS_KEY, { clientId }), [clientId]);
  useEffect(() => write(RUNS_KEY, runs), [runs]);
  useEffect(() => {
    prime(store).then((r) => Object.keys(r).length && setRuns(r));
  }, [store]);
  useEffect(() => {
    const t = setTimeout(() => write(STATE_KEY, store.snapshot()), 300); // debounced: a snapshot is several hundred KB
    return () => clearTimeout(t);
  }, [store, version]);

  const ctx: Ctx = useMemo(() => ({ actor: 'principal-1', role: 'principal', clientIds: [clientId] }), [clientId]);
  const view = useMemo(() => store.as(ctx), [store, ctx, version]);
  // The weekly report follows the data: after any change (an approved risk, a decision taken) it is rebuilt, and an
  // approved report that changed goes back to review, so what is sent always matches This week.
  const refreshFailed = useRef(false);
  useEffect(() => {
    if (refreshFailed.current) return; // a refused redraft is logged and bumps the version; do not retry in a loop
    try {
      refreshWeeklyReport(store, { actor: 'agent-1', role: 'agent', clientIds: [clientId] }, clientId);
    } catch {
      refreshFailed.current = true;
    }
  }, [store, clientId, version]);
  const notify = (msg: string, tone: Tone = 'none') => setNotice({ msg, tone });
  const go = (path: string) => (location.hash = path);

  const app: App = {
    store, view, ctx, clientId, client: view.get(clientId)!, notify, go, runs,
    inspect: setInspect,
    act: (name: ActionName, params, ok) => {
      try {
        const r = store.applyAction(ctx, name, params);
        notify(ok ?? 'Saved.', 'success');
        return r.created;
      } catch (e) {
        notify((e as Error).message, 'danger');
        return undefined;
      }
    },
    runAgent: async () => {
      try {
        const run = await runWeeklyAgent(store, { clientId, applyTriage: true });
        setRuns((r) => ({ ...r, [run.clientId]: run }));
        notify(`The assistant finished. ${run.steps.at(-1)!.output.replace(/^Stopped\. /, '').replace(/ The assistant cannot approve or send\.$/, '')}`, 'primary');
        return run;
      } catch (e) {
        notify((e as Error).message, 'danger');
      }
    },
  };

  const reset = () => {
    try {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(RUNS_KEY);
    } catch {
      /* ignore */
    }
    setRuns({});
    setStore(new Store(world));
    notify('Back to the start of the week.', 'primary');
  };
  const nav = (items: readonly (readonly [string, string])[]) =>
    items.map(([id, label]) => <a key={id} href={`#${id}`} className={route.screen === id ? 'on' : ''} aria-current={route.screen === id ? 'page' : undefined}>{label}</a>);

  return (
    <>
      <div className="banner">Demo with fictional clients. People, bills and events are fictional too, except items marked Public record.</div>
      <div className="wrap">
        <header className="top">
          <b className="brand">Korea Policy Ontology <span className="demo-tag">Demo</span></b>
          <span className="sub nowrap">As of {md(store.baseDate)}, {store.baseDate.slice(0, 4)}</span>
          <HTMLSelect minimal value={clientId} onChange={(e) => (setClientId(e.target.value), setNotice(undefined), setInspect(undefined))} options={clients.map((c) => ({ value: c.id, label: `${c.name} (fictional client)` }))} aria-label="Fictional client" className="client" />
          <MarkTag m={clientMarking(clientId)} app={app} />
          <span className="spacer" />
          <span className="sub nowrap">Viewing as engagement lead</span>
          <Button size="small" variant="minimal" text="Reset" onClick={reset} />
        </header>
        <nav className="nav" aria-label="Screens">
          <div className="nav-group">{nav(LEFT)}</div>
          <div className="nav-group nav-right">{nav(RIGHT)}</div>
        </nav>
        <main>
          {notice && <p className={`notice tone-${notice.tone}`}><span>{notice.msg}</span> <a onClick={() => setNotice(undefined)}>Dismiss</a></p>}
          {route.screen === 'week' && <ThisWeek app={app} />}
          {route.screen === 'issues' && <Issues app={app} billId={route.rest} />}
          {route.screen === 'stakeholders' && <Stakeholders app={app} path={route.rest} />}
          {route.screen === 'strategy' && <Strategy app={app} />}
          {route.screen === 'reports' && <Reports key={clientId} app={app} />}
          {route.screen === 'activity' && <ActivityLog app={app} />}
          {route.screen === 'assistant' && <AssistantRun app={app} />}
          {route.screen === 'settings' && <Settings key={clientId} app={app} tab={route.rest} />}
          {route.screen === 'ontology' && <Ontology />}
        </main>
        <footer className="colophon">{COLOPHON}</footer>
      </div>
      <ObjectDrawer id={inspectId} app={app} onClose={() => setInspect(undefined)} />
    </>
  );
}

console.info(`${COLOPHON} · https://github.com/AI-odyssey/korea-policy-ontology`);
createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
