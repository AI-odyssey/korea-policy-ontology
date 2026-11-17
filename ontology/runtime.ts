// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// In-memory ontology store: marking-filtered queries, action execution, approval gate, audit log.
// Pure TypeScript with no DOM or Node APIs, so the browser app and the tests share it.
import { actionTypes, linkTypes, PILOT_CRITERIA, REVIEW_THRESHOLD, SOURCE_TYPES, STAGE_ORDER, TERMINAL_STAGES } from './schema.ts';
import { pilotCatch, profileErrors, scorePilot } from './functions.ts';
import type { ActionName, ActionTypeDef, LinkTypeDef, Marking, Role } from './schema.ts';
import { canSee, clientMarking, PUBLIC } from './markings.ts';
import type { Ctx } from './markings.ts';
import { checkProps } from './props.ts';
import { addDays } from './dates.ts';

// ---- Records ----
export interface ObjectRecord {
  id: string;
  type: string;
  markings: Marking[];
  synthetic: boolean; // true for everything in the fictional world; false only for public records (provenance public)
  provenance?: 'synthetic' | 'public';
  [prop: string]: any;
}

export interface LinkRecord {
  id: string;
  type: string;
  from: string;
  to: string;
  props?: Record<string, any>;
  markings: Marking[];
  evidence: string[];
  synthetic: true;
}

export interface World {
  meta: { baseDate: string; seed: number; synthetic: true; description: string };
  objects: ObjectRecord[];
  links: LinkRecord[];
}

export type ErrorCode = 'PERMISSION_DENIED' | 'INVALID_PARAMS' | 'PRECONDITION_FAILED' | 'NOT_FOUND' | 'UNKNOWN_ACTION';

export class ActionError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
  }
}

export interface AuditEntry {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly role: Role;
  readonly action: string;
  readonly params: Record<string, unknown>;
  readonly status: 'executed' | 'pending_approval' | 'rejected' | 'denied';
  readonly approvedBy?: string;
  readonly pendingId?: string;
  readonly before: readonly string[]; // pre-existing objects the action touched
  readonly after: readonly string[]; // objects created or updated
  readonly removed: readonly string[];
  readonly changes: Readonly<Record<string, Readonly<Record<string, readonly [unknown, unknown]>>>>;
  readonly error?: string;
  readonly markings: readonly Marking[];
}

export interface PendingApproval {
  id: string;
  action: ActionName;
  params: Record<string, unknown>;
  requestedBy: string;
  requesterRole: Role;
  requesterClientIds: string[];
  approverRole: Role;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  markings: Marking[];
}

export interface ActionResult {
  status: 'executed' | 'pending_approval';
  auditId: string;
  pendingId?: string;
  created: string[];
  updated: string[];
}

export interface StoreSnapshot {
  world: World;
  audit: AuditEntry[];
  pending: PendingApproval[];
  counters: Record<string, number>;
  tick: number;
}

/** Read access for one caller. Everything returned is already filtered by the caller's markings. */
export interface View {
  readonly ctx: Ctx;
  readonly baseDate: string;
  get(id: string): ObjectRecord | undefined;
  list(type: string, where?: (r: ObjectRecord) => boolean): ObjectRecord[];
  links(q?: { type?: string; from?: string; to?: string }): LinkRecord[];
  targets(id: string, linkType: string): ObjectRecord[]; // follow links out of id
  sources(id: string, linkType: string): ObjectRecord[]; // follow links into id
}

// ---- Effects ----
// An effect receives a write handle. Effects validate everything before they write, because
// a store has no rollback: a throw halfway through would leave a partial change.
interface Fx {
  role: Role;
  actor: string;
  approvedBy?: string;
  baseDate: string;
  now(): string;
  get(id: string): ObjectRecord;
  find(type: string, where: (r: ObjectRecord) => boolean): ObjectRecord | undefined;
  filter(type: string, where: (r: ObjectRecord) => boolean): ObjectRecord[];
  create(type: string, prefix: string, props: Record<string, any>, markings?: Marking[]): ObjectRecord;
  update(id: string, patch: Record<string, any>): void;
  link(type: string, from: string, to: string, props?: Record<string, any>, markings?: Marking[]): LinkRecord;
  attach(type: string, from: string, to: string, ev: EvidenceInput): void;
  removeLinksWithoutSupport(evidenceId: string): void;
}

interface EvidenceInput {
  signalId?: string;
  excerpt: string;
  method: 'rule' | 'llm' | 'human';
  confidence: number;
}

const bad = (msg: string) => new ActionError('INVALID_PARAMS', msg);
// Evidence method comes from who acted, never from the caller, so an agent cannot label its own output as human-checked.
const methodOf = (role: Role): EvidenceInput['method'] => (role === 'agent' || role === 'system' ? 'rule' : 'human');
const clientOf = (p: any): Marking[] => [clientMarking(p.clientId)];
const callerMarkings = (ctx: Ctx): Marking[] => (ctx.clientIds.length ? ctx.clientIds.map(clientMarking) : [PUBLIC]);

const effects: Record<ActionName, (fx: Fx, p: any) => void> = {
  triageSignal(fx, p) {
    const sig = fx.get(p.signalId);
    if (p.dismiss) {
      fx.update(sig.id, { status: 'dismissed', relevance: p.relevance, dismissReason: p.reason ?? 'Not relevant to any tracked issue' });
      return;
    }
    if (!p.issueId && !p.billId) throw bad('issueId or billId is required unless dismissing');
    const ev: EvidenceInput = { signalId: sig.id, excerpt: p.excerpt ?? sig.title, confidence: p.confidence ?? p.relevance, method: methodOf(fx.role) };
    if (p.issueId) fx.attach('about', sig.id, p.issueId, ev);
    if (p.billId) fx.attach('mentions', sig.id, p.billId, ev);
    for (const id of p.mentionIds ?? []) fx.attach('mentions', sig.id, id, ev);
    fx.update(sig.id, { status: 'triaged', relevance: p.relevance });
  },

  linkEvidence(fx, p) {
    const def: LinkTypeDef = linkTypes[p.linkType as keyof typeof linkTypes];
    const from = fx.get(p.from);
    const to = fx.get(p.to);
    if (!def.from.includes(from.type) || !def.to.includes(to.type)) {
      throw bad(`${p.linkType} links ${def.from.join('|')} to ${def.to.join('|')}, not ${from.type} to ${to.type}`);
    }
    fx.attach(p.linkType, from.id, to.id, { signalId: p.signalId, excerpt: p.excerpt, confidence: p.confidence, method: methodOf(fx.role) });
  },

  reopenSignal(fx, p) {
    for (const e of fx.filter('Evidence', (r) => r.signalId === p.signalId && r.reviewStatus !== 'rejected')) {
      fx.update(e.id, { reviewStatus: 'rejected' });
      fx.removeLinksWithoutSupport(e.id);
    }
    fx.update(p.signalId, { status: 'new', relevance: undefined, dismissReason: undefined });
  },

  reviewEvidence(fx, p) {
    fx.update(p.evidenceId, { reviewStatus: p.verdict === 'accept' ? 'accepted' : 'rejected' });
    if (p.verdict === 'reject') fx.removeLinksWithoutSupport(p.evidenceId);
  },

  updateBillStage(fx, p) {
    const bill = fx.get(p.billId);
    const history: any[] = bill.stageHistory;
    const last = history[history.length - 1];
    const order = (s: string) => (STAGE_ORDER as readonly string[]).indexOf(s);
    const terminal = (TERMINAL_STAGES as readonly string[]).includes(p.stage);
    if (bill.stage === 'passed' || (TERMINAL_STAGES as readonly string[]).includes(bill.stage)) throw bad(`${bill.id} is already ${bill.stage}`);
    if (!terminal && order(p.stage) <= order(bill.stage)) throw bad(`stage must move forward from ${bill.stage}`);
    if (p.date < last.date) throw bad(`date precedes the last history entry (${last.date})`);
    if (p.stage === 'merged_alternative' && !p.mergedInto) throw bad('merged_alternative requires mergedInto');
    if (!bill.billNo && !p.billNo && p.stage !== 'public_comment') throw bad(`${bill.id} leaves legislative notice and needs the billNo the Assembly assigned`);
    const entry = { stage: p.stage, date: p.date, ...(p.institutionId ? { institutionId: p.institutionId } : {}) };
    fx.update(bill.id, { stage: p.stage, stageHistory: [...history, entry], ...(p.mergedInto ? { mergedInto: p.mergedInto } : {}), ...(p.billNo ? { billNo: p.billNo } : {}) });
  },

  setClientPosition(fx, p) {
    const props = { clientId: p.clientId, targetId: p.targetId, stance: p.stance, rationale: p.rationale, setBy: fx.actor, approvedBy: fx.approvedBy };
    const existing = fx.find('ClientPosition', (r) => r.clientId === p.clientId && r.targetId === p.targetId);
    if (existing) fx.update(existing.id, props);
    else fx.create('ClientPosition', 'pos', props, clientOf(p));
  },

  logInteraction(fx, p) {
    fx.create('Interaction', 'int', { ...p }, clientOf(p));
  },

  draftDeliverable(fx, p) {
    const eng = fx.find('Engagement', (r) => r.clientId === p.clientId);
    if (!eng) throw bad(`${p.clientId} has no engagement`);
    const d = fx.create('Deliverable', 'del', { ...p, status: 'draft', createdBy: fx.actor }, clientOf(p));
    fx.link('produced_for', d.id, eng.id, undefined, clientOf(p));
  },

  submitForReview: (fx, p) => fx.update(p.deliverableId, { status: 'in_review' }),
  approveDeliverable: (fx, p) => fx.update(p.deliverableId, { status: 'approved', approvedBy: fx.actor }),

  sendDeliverable(fx, p) {
    // The approver is whoever approved the deliverable, not whoever pressed send.
    fx.approvedBy = fx.get(p.deliverableId).approvedBy;
    fx.update(p.deliverableId, { status: 'sent', sentAt: fx.now() }); // simulated: nothing leaves the process
  },

  raiseDecision(fx, p) {
    const { raisedById, ...props } = p;
    const d = fx.create('Decision', 'dec', { ...props, status: 'open', openedAt: fx.now() }, clientOf(p));
    fx.link('raised_by', d.id, raisedById, undefined, clientOf(p));
  },

  resolveDecision(fx, p) {
    const d = fx.get(p.decisionId);
    fx.update(d.id, { status: 'resolved', resolution: p.resolution, resolutionNote: p.note, resolvedBy: fx.actor });
    if (p.resolution === 'approve') {
      // The follow-up has to happen before whatever the decision was due for, usually a meeting the next day.
      const due = [addDays(fx.baseDate, 3), ...(d.dueDate ? [d.dueDate] : [])].sort()[0];
      fx.create('Task', 'task', {
        clientId: d.clientId, title: `Follow up: ${clip(String(d.question), 70)}`, dueDate: due < fx.baseDate ? fx.baseDate : due,
        owner: 'human', status: 'open', subjectId: d.id,
      }, [d.markings[0]]);
    }
  },

  createTask(fx, p) {
    fx.create('Task', 'task', { ...p, status: 'open' }, clientOf(p));
  },

  completeTask: (fx, p) => fx.update(p.taskId, { status: 'done' }),

  assessStakeholder(fx, p) {
    if (p.stance !== 'unconfirmed' && !p.basisIds?.length) throw bad(`stance '${p.stance}' needs at least one basis record; use unconfirmed until there is one`);
    const props = { ...p, assessedBy: fx.actor, assessedAt: fx.baseDate };
    const existing = fx.find('StakeholderAssessment', (r) => r.clientId === p.clientId && r.subjectId === p.subjectId && r.issueId === p.issueId);
    if (existing) fx.update(existing.id, { basisIds: undefined, interests: undefined, ...props });
    else fx.create('StakeholderAssessment', 'sa', props, clientOf(p));
  },

  addRiskOpportunity(fx, p) {
    if (!p.subjectIds.length) throw bad('subjectIds must name at least one bill, issue or event');
    fx.create('RiskOpportunity', 'ro', { ...p, addedBy: fx.actor, approvedBy: fx.approvedBy }, clientOf(p));
  },

  updateStrategy(fx, p) {
    for (const id of p.targetIds ?? []) {
      if (fx.get(id).issueId !== p.issueId) throw bad(`${id} is an assessment on another issue`);
    }
    const existing = fx.find('Strategy', (r) => r.clientId === p.clientId && r.issueId === p.issueId);
    const patch = { ...p, updatedBy: fx.actor, approvedBy: fx.approvedBy };
    if (existing) return fx.update(existing.id, patch);
    if (!p.desiredOutcome || !p.messages?.length) throw bad('a new strategy needs desiredOutcome and messages');
    fx.create('Strategy', 'str', { targetIds: [], ...patch }, clientOf(p));
  },

  updateMonitoringProfile(fx, p) {
    const errs = profileErrors(p);
    for (const id of p.committees ?? []) if (!['committee', 'subcommittee'].includes(fx.get(id).kind)) errs.push(`${id} is not a committee`);
    for (const id of p.agencies ?? []) if (!['ministry', 'agency'].includes(fx.get(id).kind)) errs.push(`${id} is not a ministry or agency`);
    if (errs.length) throw bad(errs.join('; '));
    const { clientId, ...fields } = p;
    const existing = fx.find('MonitoringProfile', (r) => r.clientId === clientId);
    const patch = { ...fields, updatedBy: fx.actor, approvedBy: fx.approvedBy };
    if (existing) return fx.update(existing.id, patch);
    if (!p.objectives?.length || !p.keywords?.length) throw bad('a new profile needs objectives and keywords');
    fx.create('MonitoringProfile', 'mp', { clientId, committees: [], agencies: [], ...patch }, clientOf(p));
  },

  startPilot(fx, p) {
    const profile = fx.find('MonitoringProfile', (r) => r.clientId === p.clientId);
    if (!profile) throw bad(`${p.clientId} has no monitoring profile`);
    if (fx.find('PilotEvaluation', (r) => r.clientId === p.clientId && r.status === 'open')) throw bad(`${p.clientId} already has an open trial`);
    if (p.from > p.to) throw bad('from is after to');
    if (p.to > fx.baseDate) throw bad(`to is after ${fx.baseDate}`);
    const criteria = { ...PILOT_CRITERIA, ...p.criteria };
    if (!criteriaOk(criteria)) throw bad('criteria: access and noise are 0-1, officialMisses a count');
    const caught = pilotCatch(fx.filter('Signal', () => true), profile, p.from, p.to).map((signalId) => ({ signalId }));
    fx.create('PilotEvaluation', 'pilot', { clientId: p.clientId, title: p.title, from: p.from, to: p.to, status: 'open', criteria, expected: [], caught, startedBy: fx.actor }, clientOf(p));
  },

  setPilotCriteria(fx, p) {
    const { pilotId, ...given } = p;
    if (!Object.keys(given).length) throw bad('give at least one of access, officialMisses, noise');
    const criteria = { ...fx.get(pilotId).criteria, ...given };
    if (!criteriaOk(criteria)) throw bad('officialMisses must be a whole number');
    fx.update(pilotId, { criteria });
  },

  addExpectedItem(fx, p) {
    const pilot = fx.get(p.pilotId);
    if (p.date < pilot.from || p.date > pilot.to) throw bad(`date is outside the trial window (${pilot.from} to ${pilot.to})`);
    const n = Math.max(0, ...pilot.expected.map((e: { id: string }) => Number(e.id.slice(4)))) + 1;
    const item = { id: `exp-${n}`, title: p.title, ...(p.url ? { url: p.url } : {}), date: p.date, sourceType: p.sourceType };
    fx.update(pilot.id, { expected: [...pilot.expected, item] });
  },

  markRelevance(fx, p) {
    const pilot = fx.get(p.pilotId);
    if (!pilot.caught.some((c: { signalId: string }) => c.signalId === p.signalId)) throw bad(`${p.signalId} is not among the items caught in this trial`);
    fx.update(pilot.id, { caught: pilot.caught.map((c: { signalId: string }) => (c.signalId === p.signalId ? { ...c, relevance: p.relevance } : c)) });
  },

  closePilot(fx, p) {
    const pilot = fx.get(p.pilotId);
    const sources = fx.find('MonitoringProfile', (r) => r.clientId === pilot.clientId)?.sources ?? SOURCE_TYPES;
    const m = scorePilot(pilot, fx.filter('Signal', () => true), sources);
    fx.update(pilot.id, { status: 'closed', closedBy: fx.actor, result: m.pass ? 'pass' : 'fail' });
  },
};

const criteriaOk = (c: any) => [c.access, c.noise].every((x) => typeof x === 'number' && x >= 0 && x <= 1) && Number.isInteger(c.officialMisses) && c.officialMisses >= 0;

// Cut at a word boundary so a title never ends mid-word.
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n + 1).replace(/\s+\S*$/, '')}...`);

// ---- Store ----
const freeze = <T extends object>(o: T): T => {
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) freeze(v);
  return Object.freeze(o);
};

export class Store {
  readonly baseDate: string;
  private meta: World['meta'];
  private byId = new Map<string, ObjectRecord>();
  private byType = new Map<string, Map<string, ObjectRecord>>();
  private linkById = new Map<string, LinkRecord>();
  private out = new Map<string, LinkRecord[]>();
  private inc = new Map<string, LinkRecord[]>();
  private auditLog: AuditEntry[] = [];
  private pending: PendingApproval[] = [];
  private counters: Record<string, number> = {};
  private tick = 0;
  private listeners = new Set<() => void>();
  version = 0; // bumps on every change; handy for UI invalidation

  constructor(input: World | StoreSnapshot) {
    const snap = 'world' in input ? input : undefined;
    const world = structuredClone(snap ? snap.world : input) as World;
    this.meta = world.meta;
    this.baseDate = world.meta.baseDate;
    for (const o of world.objects) this.putObject(o);
    for (const l of world.links) this.putLink(l);
    if (snap) {
      this.auditLog = snap.audit.map((a) => freeze(structuredClone(a)));
      this.pending = structuredClone(snap.pending);
      this.counters = { ...snap.counters };
      this.tick = snap.tick;
    }
  }

  static fromSnapshot(s: StoreSnapshot): Store {
    return new Store(s);
  }

  snapshot(): StoreSnapshot {
    const world: World = { meta: this.meta, objects: [...this.byId.values()], links: [...this.linkById.values()] };
    return structuredClone({ world, audit: this.auditLog, pending: this.pending, counters: this.counters, tick: this.tick });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Deterministic clock: the base date at 09:00 UTC, one second per call.
  private now = (): string => new Date(Date.parse(`${this.baseDate}T09:00:00Z`) + ++this.tick * 1000).toISOString().replace('.000Z', 'Z');
  private nextId = (prefix: string): string => `${prefix}-r${String((this.counters[prefix] = (this.counters[prefix] ?? 0) + 1)).padStart(3, '0')}`;
  private changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  // -- indexes --
  // Stored records are frozen, so a caller holding a record from a view cannot change markings or status in place.
  private putObject(o: ObjectRecord) {
    freeze(o);
    this.byId.set(o.id, o);
    if (!this.byType.has(o.type)) this.byType.set(o.type, new Map());
    this.byType.get(o.type)!.set(o.id, o);
  }
  private putLink(l: LinkRecord) {
    freeze(l);
    this.linkById.set(l.id, l);
    for (const [idx, key] of [[this.out, l.from], [this.inc, l.to]] as const) {
      const arr = idx.get(key);
      const i = arr ? arr.findIndex((x) => x.id === l.id) : -1;
      if (!arr) idx.set(key, [l]);
      else if (i >= 0) arr[i] = l;
      else arr.push(l);
    }
  }
  private dropLink(l: LinkRecord) {
    this.linkById.delete(l.id);
    for (const [idx, key] of [[this.out, l.from], [this.inc, l.to]] as const) {
      idx.set(key, (idx.get(key) ?? []).filter((x) => x.id !== l.id));
    }
  }

  // -- reads --
  as(ctx: Ctx): View {
    const vis = (o: ObjectRecord | undefined) => (o && canSee(ctx, o.markings) ? o : undefined);
    const visLink = (l: LinkRecord) => canSee(ctx, l.markings) && !!vis(this.byId.get(l.from)) && !!vis(this.byId.get(l.to));
    const links = (q: { type?: string; from?: string; to?: string } = {}) => {
      const pool = q.from ? this.out.get(q.from) ?? [] : q.to ? this.inc.get(q.to) ?? [] : [...this.linkById.values()];
      return pool.filter((l) => (!q.type || l.type === q.type) && (!q.from || l.from === q.from) && (!q.to || l.to === q.to) && visLink(l));
    };
    return {
      ctx,
      baseDate: this.baseDate,
      get: (id) => vis(this.byId.get(id)),
      list: (type, where) => [...(this.byType.get(type)?.values() ?? [])].filter((o) => vis(o) && (!where || where(o))),
      links,
      targets: (id, t) => links({ type: t, from: id }).map((l) => this.byId.get(l.to)!),
      sources: (id, t) => links({ type: t, to: id }).map((l) => this.byId.get(l.from)!),
    };
  }

  auditEntries(ctx: Ctx): AuditEntry[] {
    return this.auditLog.filter((a) => canSee(ctx, a.markings));
  }
  pendingApprovals(ctx: Ctx): PendingApproval[] {
    return this.pending.filter((p) => p.status === 'pending' && canSee(ctx, p.markings)).map((p) => structuredClone(p)); // copies: callers cannot edit what will run
  }
  /** Evidence below the confidence threshold, waiting for a human. */
  reviewQueue(ctx: Ctx): ObjectRecord[] {
    return this.as(ctx).list('Evidence', (e) => e.reviewStatus === 'review');
  }

  // -- writes --
  applyAction(ctx: Ctx, name: ActionName, params: Record<string, unknown>): ActionResult {
    const def = Object.hasOwn(actionTypes, name) ? (actionTypes[name] as ActionTypeDef) : undefined;
    if (!def) throw new ActionError('UNKNOWN_ACTION', `unknown action ${String(name)}`);
    this.guard(ctx, name, def, params, true);
    if (def.requiresApproval && ctx.role !== def.approverRole) {
      const markings = this.paramMarkings(def, params);
      const p: PendingApproval = {
        id: this.nextId('pend'), action: name, params: structuredClone(params), requestedBy: ctx.actor, requesterRole: ctx.role,
        requesterClientIds: [...ctx.clientIds], approverRole: def.approverRole!, status: 'pending', createdAt: this.now(), markings,
      };
      this.pending.push(p);
      const auditId = this.record(ctx, name, params, 'pending_approval', { markings, pendingId: p.id });
      this.changed();
      return { status: 'pending_approval', auditId, pendingId: p.id, created: [], updated: [] };
    }
    const res = this.execute(ctx, name, params, def.requiresApproval ? ctx.actor : undefined);
    this.changed();
    return res;
  }

  /** The approver role runs a request that was waiting at the gate. */
  approve(ctx: Ctx, pendingId: string): ActionResult {
    const p = this.openPending(ctx, pendingId);
    const requester: Ctx = { actor: p.requestedBy, role: p.requesterRole, clientIds: p.requesterClientIds };
    this.guard(requester, p.action, actionTypes[p.action], p.params, true); // state may have moved on
    const res = this.execute(requester, p.action, p.params, ctx.actor, pendingId);
    p.status = 'approved';
    p.decidedBy = ctx.actor;
    p.decidedAt = this.now();
    this.changed(); // listeners run only once the request is marked approved
    return res;
  }

  reject(ctx: Ctx, pendingId: string): void {
    const p = this.openPending(ctx, pendingId);
    p.status = 'rejected';
    p.decidedBy = ctx.actor;
    p.decidedAt = this.now();
    this.record({ actor: p.requestedBy, role: p.requesterRole, clientIds: [] }, p.action, p.params, 'rejected', { markings: p.markings, pendingId, approvedBy: ctx.actor });
    this.changed();
  }

  private openPending(ctx: Ctx, id: string): PendingApproval {
    const p = this.pending.find((x) => x.id === id && x.status === 'pending');
    if (!p || !canSee(ctx, p.markings)) throw new ActionError('NOT_FOUND', `no pending approval ${id}`);
    if (ctx.role !== p.approverRole) throw new ActionError('PERMISSION_DENIED', `only ${p.approverRole} can decide ${id}`);
    return p;
  }

  /** Role, parameter and precondition checks. Failures are written to the audit log, then thrown. */
  private guard(ctx: Ctx, name: ActionName, def: ActionTypeDef, params: Record<string, unknown>, log: boolean) {
    // A refusal is filed under the caller's own layers. Marking it by the named objects would let a caller
    // tell a hidden object (entry disappears from their log) from a missing one (entry stays).
    const fail = (code: ErrorCode, msg: string): never => {
      if (log) {
        this.record(ctx, name, params, 'denied', { error: `${code}: ${msg}`, markings: callerMarkings(ctx) });
        this.changed();
      }
      throw new ActionError(code, msg);
    };
    if (!def.allowedRoles.includes(ctx.role)) fail('PERMISSION_DENIED', `role ${ctx.role} may not run ${name}`);
    const view = this.as(ctx);
    const errs = checkProps(def.params, params, (id) => view.get(id)?.type);
    if (errs.length) fail('INVALID_PARAMS', errs.join('; '));
    // One call writes into one client layer: every object it names is PUBLIC or belongs to the same client.
    const layers = this.paramMarkings(def, params).filter((m) => m !== PUBLIC);
    if (layers.length > 1) fail('INVALID_PARAMS', `parameters reference more than one client layer (${layers.join(', ')})`);
    for (const pre of def.preconditions ?? []) {
      const obj = view.get(params[pre.param] as string)!;
      if (!pre.in.includes(obj[pre.field])) fail('PRECONDITION_FAILED', pre.message);
    }
  }

  /** Non-public markings of every object the parameters name; [PUBLIC] when there are none. */
  private paramMarkings(def: ActionTypeDef, params: Record<string, unknown>): Marking[] {
    const set = new Set<Marking>();
    for (const [k, d] of Object.entries(def.params)) {
      const v = params[k];
      for (const id of d.type === 'ref' ? [v] : d.type === 'ref[]' && Array.isArray(v) ? v : []) {
        for (const m of this.byId.get(id as string)?.markings ?? []) if (m !== 'PUBLIC') set.add(m);
      }
    }
    return set.size ? [...set] : [PUBLIC];
  }

  private execute(ctx: Ctx, name: ActionName, params: Record<string, unknown>, approvedBy?: string, pendingId?: string): ActionResult {
    const before = new Set<string>();
    const created: string[] = [];
    const removed: string[] = [];
    const changes: Record<string, Record<string, [unknown, unknown]>> = {};
    const touched: (ObjectRecord | LinkRecord)[] = [];
    const store = this;

    const fx: Fx = {
      role: ctx.role, actor: ctx.actor, approvedBy, baseDate: this.baseDate, now: this.now,
      get(id) {
        const o = store.byId.get(id);
        if (!o) throw new ActionError('NOT_FOUND', id);
        return o;
      },
      find: (type, where) => [...(store.byType.get(type)?.values() ?? [])].find(where),
      filter: (type, where) => [...(store.byType.get(type)?.values() ?? [])].filter(where),
      create(type, prefix, props, markings = [PUBLIC]) {
        const o: ObjectRecord = { id: store.nextId(prefix), type, markings, synthetic: true, ...props };
        store.putObject(o);
        created.push(o.id);
        touched.push(o);
        return o;
      },
      update(id, patch) {
        const old = fx.get(id);
        const diff: Record<string, [unknown, unknown]> = {};
        for (const [k, v] of Object.entries(patch)) if (JSON.stringify(old[k]) !== JSON.stringify(v)) diff[k] = [old[k], v];
        store.putObject({ ...old, ...patch }); // new identity so UI diffing sees the change
        before.add(id);
        changes[id] = { ...changes[id], ...diff };
        touched.push(old);
      },
      link(type, from, to, props, markings = [PUBLIC]) {
        const l: LinkRecord = { id: store.nextId('lnk'), type, from, to, ...(props ? { props } : {}), markings, evidence: [], synthetic: true };
        store.putLink(l);
        created.push(l.id);
        return l;
      },
      attach(type, from, to, ev) {
        const sig = ev.signalId ? fx.get(ev.signalId) : undefined;
        const e = fx.create('Evidence', 'ev', {
          sourceUrl: sig?.url ?? 'https://example.invalid/records/manual-entry',
          sourceType: sig?.sourceType ?? 'official_record',
          signalId: ev.signalId, excerpt: ev.excerpt, method: ev.method, confidence: ev.confidence,
          reviewStatus: ev.method !== 'human' && ev.confidence < REVIEW_THRESHOLD ? 'review' : 'accepted',
        });
        const existing = store.out.get(from)?.find((l) => l.type === type && l.to === to);
        if (existing) {
          store.putLink({ ...existing, evidence: [...existing.evidence, e.id] });
          before.add(existing.id);
        } else {
          const l = fx.link(type, from, to);
          store.putLink({ ...l, evidence: [e.id] });
        }
      },
      removeLinksWithoutSupport(evidenceId) {
        for (const l of [...store.linkById.values()]) {
          if (!l.evidence.includes(evidenceId)) continue;
          const alive = l.evidence.some((id) => id !== evidenceId && store.byId.get(id)?.reviewStatus !== 'rejected');
          if (!alive) {
            store.dropLink(l);
            removed.push(l.id);
          }
        }
      },
    };

    try {
      effects[name](fx, params);
    } catch (e) {
      // Effects validate before they write, so nothing was changed; the refusal is still recorded.
      const code = e instanceof ActionError ? e.code : 'INVALID_PARAMS';
      this.record(ctx, name, params, 'denied', { error: `${code}: ${(e as Error).message}`, markings: callerMarkings(ctx) });
      this.changed();
      throw e;
    }

    const entryMarkings = new Set<Marking>();
    for (const o of [...touched, ...created.map((id) => store.byId.get(id)).filter(Boolean)] as ObjectRecord[]) {
      for (const m of o.markings) if (m !== 'PUBLIC') entryMarkings.add(m);
    }
    const updated = [...before];
    // An action on public objects taken inside a client workspace (say, triaging a signal for Aster) still says
    // what that client is watching, so its log entry is filed under the caller's client layer, not PUBLIC.
    const auditId = this.record(ctx, name, params, 'executed', {
      approvedBy: fx.approvedBy, pendingId, before: updated, after: [...new Set([...created, ...updated])], removed, changes,
      markings: entryMarkings.size ? [...entryMarkings] : callerMarkings(ctx),
    });
    return { status: 'executed', auditId, pendingId, created, updated };
  }

  private record(ctx: Ctx, action: string, params: Record<string, unknown>, status: AuditEntry['status'], extra: Partial<AuditEntry> & { markings: readonly Marking[] }): string {
    const entry: AuditEntry = freeze({
      id: this.nextId('aud'), at: this.now(), actor: ctx.actor, role: ctx.role, action, params: structuredClone(params), status,
      before: [], after: [], removed: [], changes: {}, ...structuredClone(extra),
    });
    this.auditLog.push(entry);
    return entry.id;
  }
}
