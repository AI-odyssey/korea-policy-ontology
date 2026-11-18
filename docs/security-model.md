# Security model

All clients, people, bills and events are fictional. This document describes the controls the runtime enforces, with the code and the tests that back each one, so a reviewer can check them.

The model generalizes a rule I follow in real work: confidential client material goes only to an approved AI vendor and never to a public code host. Here that becomes a configurable provider allow-list checked at the adapter boundary, on top of a runtime that separates clients below the interface.

## 1. Two layers

| Layer | Marking | Object types | Link types |
|---|---|---|---|
| Public | `PUBLIC` | Issue, Bill, Provision, Institution, Person, StakeholderOrg, Event, Signal, Evidence (except evidence from a client's filing) | sponsors, cosponsors, member_of, referred_to, amends, about, agenda_item, testifies_at, regulates, mentions |
| Client | `CLIENT:<clientId>` | Client, Engagement, ClientPosition, Interaction, Deliverable, Decision, Task, StakeholderAssessment, RiskOpportunity, Strategy, MonitoringProfile, PilotEvaluation, SignalTriage | affects, watches, produced_for, raised_by |

Rules (enforced by `ontology/validate.ts` on the world and by `Store` on every action):

- Client objects may reference public objects. A public object never references a client object, and a public link never touches a client object.
- A client object or link may reference only its own client's objects. A client-layer link must carry a `CLIENT` marking that matches its endpoints.
- Objects created by an action get their marking from the action: client actions mark what they create with `CLIENT:<clientId>` from the call's `clientId`; filing an item is a client judgment, so the `SignalTriage` record and the `about` / `mentions` links and Evidence it creates all carry `CLIENT:<clientId>`. One client's filing never changes the shared item, another client's queue or what another client sees linked to it.
- One action call writes into one client layer. Before it runs, the runtime collects the markings of every object the parameters name; if more than one client layer appears, the call is refused (`INVALID_PARAMS`). So an Aster assessment cannot rest on a Moru meeting, and an Aster decision cannot be raised by a Moru task.
- A client's judgment about a public person or organization is a `StakeholderAssessment` in that client's layer. `Person` and `StakeholderOrg` carry no stance ([ADR-0010](decisions/ADR-0010-client-judgments-in-client-layer.md)).

## 2. Caller context and views

Every read and write takes a context (`ontology/markings.ts`):

```ts
interface Ctx { actor: string; role: 'system' | 'agent' | 'consultant' | 'principal'; clientIds: readonly string[] }
```

- `canSee(ctx, markings)` is true only if every marking on the record is `PUBLIC` or one of the caller's clients. A record with no markings is hidden (fail closed).
- `store.as(ctx)` returns a view whose `get`, `list`, `links`, `targets` and `sources` all filter through `canSee`. A link is visible only if the link and both endpoints are visible, so a traversal never passes through, or reveals, a hidden object.
- Every function in `ontology/functions.ts` takes a view, so counts and rankings are computed on filtered data. Asking about a client the caller cannot see throws "does not exist or is not accessible".
- Functions also ignore links whose only evidence is still waiting in the review queue, so an unchecked low-confidence link does not change a response level or a ranking.
- Records handed out by a view are deep-frozen. A caller holding a record cannot change its markings or status in place. Pending approvals are handed out as copies, so editing one does not change what will run.
- The assistant's context is `{ actor: 'agent-1', role: 'agent', clientIds: [<one client>] }`. The demo viewer's context is `{ actor: 'principal-1', role: 'principal', clientIds: [<selected client>] }`.

## 3. Permissions and approvals

The permission matrix is generated from `ontology/schema.ts` into [ontology.md](ontology.md#permission-matrix). `tests/permissions.test.ts` runs every action as every role and checks the outcome against the schema, and `tests/docs.test.ts` checks that the generated file is current.

The sensitive rows, in words:

- `updateBillStage` is for the collector (`system`) only. Stages only move forward, and a passed, merged or withdrawn bill cannot change.
- `approveDeliverable` and `resolveDecision` are for the principal only.
- `sendDeliverable` is for consultants and the principal, and only once the deliverable's status is `approved`. The assistant cannot send.
- `setClientPosition` and `updateStrategy` by a consultant wait for the principal. `addRiskOpportunity` by the assistant or a consultant waits for the principal.
- `assessStakeholder`, `reviewEvidence`, `reopenSignal`, `logInteraction` and `completeTask` are for people only. A stance other than `unconfirmed` needs at least one basis record. `reopenSignal` undoes a triage: the signal returns to the queue, its evidence is marked rejected and links left without support are removed.
- The Evidence `method` is set from the role (`rule` for the assistant and the collector, `human` for people). A caller cannot choose it, so the assistant cannot mark its own low-confidence link as human-checked. Assistant evidence below 0.8 confidence goes to the review queue.

Approval is stored as data. When an action needs approval and the caller is not the approver, the runtime stores a pending request: the action, a copy of the parameters, the requester's actor, role and client ids, the approver role, and the markings of the objects it names. The audit log gets a `pending_approval` entry. When the principal approves, the runtime re-runs the role, parameter and precondition checks as the requester (state may have moved on), then executes with `approvedBy` set to the principal. A rejection writes a `rejected` entry and nothing runs. When the principal runs a gated action directly, it executes at once with the principal recorded as approver.

For `sendDeliverable`, the audit entry's `approvedBy` is whoever approved the deliverable, not whoever pressed send.

In the demo the viewer is always the engagement lead, so decisions and report approvals happen on screen. When the demo opens, the Aster workspace already holds two pending requests (an assistant risk proposal and a consultant position change), so the approval path is visible too; it is also exercised in `tests/approval.test.ts`, `tests/client-layer.test.ts` and `tests/agent.test.ts`.

## 4. Model-provider gate

The optional language-model adapter (`agent/llm.ts`) is the only path by which data could leave the runtime.

- `GateConfig.approvedClientDataProviders` is the allow-list. It is empty by default.
- `serializeForProvider(provider, objects, cfg)` is the only function that turns ontology objects into text for a provider. It calls `assertProviderAllowed`, which throws `ProviderGateError` if any object has no markings, or if any object has a `CLIENT` marking and the provider is not on the list. Public-only objects may go to any provider.
- `guardedComplete` checks first that the adapter is enabled (a disabled adapter never receives anything), then runs the gate, and only then calls the adapter. The check runs on the object set, not on prompt text, so wording cannot get past it.
- The assistant uses the adapter for one thing: a two-sentence summary at the top of the weekly report, built from the client object and the top three bills. Because the client object is client-marked, any provider not on the list is blocked. A block appears in the assistant's trace as a gate step and the summary is written from the week's records instead.
- The shipped demo uses the disabled adapter (`provider: 'none'`). Its trace says "The summary is written from this week's records, without a language model." The demo makes no network calls.

## 5. Activity log

Every action writes an entry, whether it ran, waited, was rejected or was refused (`ontology/runtime.ts`, `AuditEntry`):

```ts
{
  id, at,                 // deterministic clock: the base date at 09:00 UTC, one second per call
  actor, role,            // who acted
  action, params,         // what was asked
  status,                 // 'executed' | 'pending_approval' | 'rejected' | 'denied'
  approvedBy?, pendingId?,
  before, after, removed, // ids of objects that existed, were created or updated, and links removed
  changes,                // per object: field -> [old, new]
  error?,                 // for refusals, e.g. 'PRECONDITION_FAILED: Blocked until the principal approves the deliverable'
  markings                // who may read this entry
}
```

How an entry is marked:

- **Executed:** the client markings of every object the action touched or created. If it touched only public objects, the entry takes the caller's client markings. Triaging a public signal in the Aster workspace is therefore filed under `CLIENT:cli-aster`, because it says what Aster is watching; Moru's log never shows it. The collector, which has no client, writes `PUBLIC` entries.
- **Refused:** the caller's own markings, whatever objects the call named. A probe for a hidden Moru record and a probe for a record that does not exist produce the same error and the same entry, so a refusal does not reveal whether a hidden object exists.
- **Pending and rejected:** the markings of the objects the request names.

Entries are deep-frozen and the log is append-only: no action edits or deletes entries. `store.auditEntries(ctx)` filters by `canSee` like any other read.

## 6. What the tests prove

| Claim | Where |
|---|---|
| An Aster context cannot read Moru positions, interactions, assessments or the client itself; links into another client layer are invisible; functions refuse another client | `tests/isolation.test.ts`, `tests/client-layer.test.ts` |
| One call may not join two client layers; the same calls inside one layer succeed and the world still validates | `tests/isolation.test.ts` |
| Records and links from a view, records written by actions, and pending requests cannot be changed from outside | `tests/isolation.test.ts` |
| Each client's activity log holds only its own entries; a refused probe does not reveal whether a hidden object exists | `tests/isolation.test.ts` |
| Triage in a client workspace is logged under that client; the collector writes public entries | `tests/client-layer.test.ts` |
| Undoing a triage is for people only and removes only the links that rested on that item | `tests/approval.test.ts` |
| Every role against every action matches the schema; refusals are logged | `tests/permissions.test.ts` |
| Consultant position changes wait; only the principal approves; rejected requests never run; send is blocked until approval | `tests/approval.test.ts` |
| Assistant and consultant risk proposals and consultant strategy changes wait for the principal; stances need a basis; assessments are for people only | `tests/client-layer.test.ts` |
| Monitoring settings and trials are invisible to other clients; consultant setting changes wait for the principal; the assistant cannot change them | `tests/settings.test.ts` |
| The assistant run never sees another client's objects or log entries, and stops at the approval gates | `tests/agent.test.ts` |
| Client-marked objects are blocked for unlisted providers, unmarked objects fail closed, and the adapter is never called when the gate refuses | `tests/gate.test.ts`, `tests/agent.test.ts` |
| Public links without evidence, cross-client references, wrong markings and non-synthetic records are rejected by the validator | `tests/world.test.ts` |

These tests show how the runtime behaves on the synthetic world. They do not show that a deployment is secure.

## 7. Threats and mitigations

| Threat | Mitigation | Remaining gap |
|---|---|---|
| Cross-client leak through a query or traversal | Marking filter in every view method; links hidden if either end is hidden | A server deployment needs the same filter behind real authentication |
| Leak through counts or rankings | Functions compute on the filtered view | A search index added later must be marking-aware |
| Cross-client reference written by an action | One call, one client layer; validator rejects cross-client references | None known in the demo |
| Leak through the activity log | Entries marked by client; client-context actions on public objects filed under that client; refusals marked by the caller | A caller assigned to several clients sees each entry only if it may see all of its markings |
| Client data sent to an unapproved model | Gate on the object set before the adapter is called; empty allow-list by default | The allow-list depends on configuration and vendor contracts |
| Prompt injection from a signal | Signals are data; triage is rules; the assistant can call only declared actions, cannot approve, resolve or send | A hostile item could cause a wrong proposal, which a person confirms or the review queue holds |
| Assistant over-reach | Role matrix; one-client context; approval gates; stance and evidence review for people only | Role definitions need review per deployment |
| Wrong or fabricated link | Evidence required; method set by role; assistant evidence under 0.8 held for review and ignored by functions until accepted | A rule error at high confidence still enters |
| A client judgment presented as public fact | Stance lives only in `StakeholderAssessment`, in the client layer, with its basis and author | Basis records can age; staleness is not flagged yet |
| Tampering with records or the log in memory | Frozen records, append-only frozen log | State lives in the browser; a real deployment needs server-side immutable storage |
| Identity spoofing | Not addressed: the demo viewer is fixed as the engagement lead | Real identity and server enforcement required |
| Confidential data committed to a public repository | Fictional data policy ([ADR-0008](decisions/ADR-0008-fictional-data-policy.md)), `synthetic` flag checked by the validator, a scan before publishing | Depends on the author's discipline and the scan |
