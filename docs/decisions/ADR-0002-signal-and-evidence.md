# ADR-0002: Signal is an object; every public link carries Evidence

Status: accepted

## Context
Policy facts arrive as raw items: a bill update, a press release, a legislative notice, news, minutes. Links derived from them (this item is about that bill) are the part people question. Storing links as bare edges or tags loses the reason.

## Decision
Keep each raw item as a `Signal` with its source type, original text and a collector status (`new`, `triaged`, `dismissed`). How each company files an item is a `SignalTriage` record in that company's layer, so one company's triage never changes the shared item or another company's queue. Every public-layer link must have at least one `Evidence` record: source, excerpt, method (`rule` or `human`; `llm` is reserved and no code path writes it) and confidence. The method is set from the role that acted, never by the caller. Evidence from the assistant below 0.8 confidence waits in a review queue with status `review`; `reviewEvidence` lets a person accept or reject it, and rejecting removes a link left without support. Functions ignore links whose only evidence is still in review. The validator rejects public links without Evidence.

## Consequences
- Any link traces to an excerpt, a source and who or what made it, which supports review and the footnotes in the weekly report.
- The assistant cannot label its own uncertain link as human-checked.
- An unchecked link cannot change a response level or a ranking.
- Storage grows with evidence (908 records in the sample world).
- Ingestion must keep original text, including for items later dismissed.
