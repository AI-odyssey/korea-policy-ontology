# ADR-0004: Approval gates for actions that reach leadership

Status: accepted

## Context
An assistant that drafts saves hours. An assistant that sends, sets the company's stated position or decides a business call can do harm that outweighs those hours: one wrong message to leadership or an official. Accountability for these steps belongs to a person.

## Decision
- `approveDeliverable` and `resolveDecision` are for the head of government affairs only. `sendDeliverable` is for people only and requires status `approved`.
- `setClientPosition` and `updateStrategy` from an analyst, and `addRiskOpportunity` from the assistant or an analyst, are stored as pending requests that run only when the head of government affairs approves that exact request. The runtime re-checks the request as the requester before running it and records the approver.
- `assessStakeholder`, `reviewEvidence`, `logInteraction` and `completeTask` are for people only.
- The assistant may triage, link evidence, draft and submit deliverables, raise decisions and create tasks. A person can undo any triage with `reopenSignal`.
- External sending is simulated.

In the demo the principal is shown as the head of government affairs, and the viewer is always that person, so there is no role switch. When the demo opens, two items already wait for the head of government affairs at Aster, each shown next to what it changes and labeled with who proposed it: a risk the assistant proposed, at the top of the risks on This week, and a position change an analyst asked for, under the issue on Issues & bills.

## Consequences
- A person is in the loop where it is slowest, by design.
- The activity log records who acted, who approved, and the result, including refusals.
- The principal can become a bottleneck. The Decision object, with a recommendation, alternatives, a due date and the record it rests on, exists to make the approval quick.
- The role matrix needs review per deployment.
