# ADR-0010: Client judgments about public stakeholders live in the client layer

Status: accepted

## Context
The Stakeholders screen needs a stance (supportive, neutral, opposed), an influence level and a relevance level for each lawmaker, official or organization. The obvious place for them is the `Person` or `StakeholderOrg` record. But a stance is not a fact about a public person. It is one client's reading of that person on one issue, built from what that client has seen and said in meetings, and it is confidential: a client's view of a lawmaker is exactly the kind of material that must not reach another client. Two clients working on the same issue can also read the same person differently, and neither may learn the other's view.

## Decision
Keep judgments in a separate object type, `StakeholderAssessment`, in the client layer and marked `CLIENT:<clientId>`. It holds the client, the subject (a `Person` or `StakeholderOrg`), the issue, stance, influence, relevance, the basis records (`Bill`, `Event`, `Signal` or `Interaction`), interests, who assessed it and when. One assessment per client, subject and issue. `Person` and `StakeholderOrg` carry no stance.

Two rules keep judgment with people:

- A stance other than `unconfirmed` needs at least one basis record. The runtime refuses it otherwise and the validator rejects it in the world file. The screen shows **Unconfirmed** until there is a basis.
- `assessStakeholder` is open to consultants and the principal only. The assistant can gather the records a stance might rest on; it cannot set one.

`stakeholderNetwork` draws edges between assessed stakeholders only from public links (cosponsorship, a shared committee, a joint event involving an organization), so the relations are public fact and the colors are the client's judgment.

## Consequences
- The public record stays free of client judgment, and the leak test covers stances like any other client object.
- Two clients can disagree about a person without either knowing.
- Every stance can be traced to the records behind it and to the person who set it.
- One more object type and a join on the stakeholder screens.
- Basis records age; a stance resting on an old statement is not flagged yet.
