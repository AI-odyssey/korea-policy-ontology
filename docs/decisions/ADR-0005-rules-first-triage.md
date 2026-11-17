# ADR-0005: Rules and human review for triage; the model only behind a provider gate

Status: accepted

## Context
Most items can be linked by explicit cues: a bill number, a bill title, an issue keyword, a known name. A language model would add value only on the ambiguous remainder, and it adds a path by which client data can leave.

## Decision
Triage is rule-based (`agent/triage.ts`). Each keyword hit, a title match and an exact bill number add independent weight; an exact bill number alone gives 0.9. Proposals at or above 0.8 are clear matches: the weekly assistant files the ones that concern its client and lists them on This week under **Filed automatically**, where a person can undo each one. Those below 0.8 are shown to a person under **New items to confirm**; proposals below 0.25 are set aside as noise. There is no model in the triage path. The only optional model call is a two-sentence summary at the top of the weekly report. It goes through `guardedComplete`, which skips a disabled adapter and otherwise checks the markings of every object it would send, refusing client-marked data for any provider not on the allow-list. The adapter is disabled by default and the shipped demo needs no model.

## Consequences
- Triage is reproducible and testable offline.
- A person confirms every uncertain filing and can undo any automatic one.
- Model cost and exposure are near zero; the summary falls back to template text when the model is off or blocked.
- Rules are brittle at the edges (aliases, renamed bodies, amended titles), so the confirmation queue is part of the design.
- Model quality is not demonstrated in this repository.
