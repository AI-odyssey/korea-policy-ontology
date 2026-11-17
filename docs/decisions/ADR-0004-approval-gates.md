# ADR-0004: Approval gates for client-facing actions

Status: accepted

## Context
An assistant that drafts saves hours. An assistant that sends, sets a client's stated position or decides a judgment call can do harm that outweighs those hours: one wrong message to a client or an official. Accountability for these steps belongs to a person.

## Decision
- `approveDeliverable` and `resolveDecision` are for the principal only. `sendDeliverable` is for people only and requires status `approved`.
- `setClientPosition` and `updateStrategy` from a consultant, and `addRiskOpportunity` from the assistant or a consultant, are stored as pending requests that run only when the principal approves that exact request. The runtime re-checks the request as the requester before running it and records the approver.
- `assessStakeholder`, `reviewEvidence`, `logInteraction` and `completeTask` are for people only.
- The assistant may triage, link evidence, draft and submit deliverables, raise decisions and create tasks. A person can undo any triage with `reopenSignal`.
- External sending is simulated.

In the demo the principal is shown as the engagement lead, and the viewer is always that person, so there is no role switch. When the demo opens, two requests already wait for the Aster lead under **Waiting for your approval**: a risk the assistant proposed and a position change a consultant asked for, each labeled with who requested it.

## Consequences
- A person is in the loop where it is slowest, by design.
- The activity log records who acted, who approved, and the result, including refusals.
- The principal can become a bottleneck. The Decision object, with a recommendation, alternatives, a due date and the record it rests on, exists to make the approval quick.
- The role matrix needs review per deployment.
