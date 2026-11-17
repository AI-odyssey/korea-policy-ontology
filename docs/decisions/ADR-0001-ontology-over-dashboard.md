# ADR-0001: Model the work as an ontology, not a dashboard or a chatbot

Status: accepted

## Context
The work needs answers that cross object types (a client's issue, a bill, a subcommittee member, a prior meeting). A dashboard hard-codes one path through those relations. A document chatbot has no stable identity, time or permissions, and cannot explain why two things are linked.

## Decision
Define objects with identity, typed links with cardinality and evidence rules, actions with validation and roles, and deterministic functions. Screens, agents and reports are clients of this model.

## Consequences
- New questions are new functions or queries over existing objects, not new pipelines.
- The agent and the human use the same actions, so permissions apply uniformly.
- Upfront cost: someone must design and maintain the model and the issue list.
- The model can be wrong in ways a free-text tool cannot, because it commits to structure.
