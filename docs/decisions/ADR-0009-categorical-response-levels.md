# ADR-0009: Categorical response levels instead of risk scores on screen

Status: accepted, amended 2026-11-17 and 2026-11-18

## Context
The first version showed each bill's `billRiskScore`, a 0 to 100 weighted sum of stage progress, committee calendar, client position and issue impact, and raised a decision when the score rose by 10 points in a week. Two problems showed up. First, the number did not track the moment that mattered: in the sample week the sidewalk robot duties bill cleared the subcommittee and faced the full committee in three days, yet its score rose only from 74 to 78.8, because the calendar component was already full a week earlier. Second, a client executive reading "78.8" cannot tell which input moved, cannot argue with it, and reads precision into weights that were set by hand. GR judgment is a few named facts and a stance.

## Decision
On screen and in the weekly report, a bill carries one of four response levels, decided by explicit rules in `responseLevel` (`ontology/functions.ts`) and always shown with its reasons:

- **Act now:** it is on a committee, subcommittee or plenary agenda within 7 days, the client wants it changed (oppose or amend), and either it moved this week or the client opposes it and the impact is high.
- **Engage:** the client wants it changed and it moved this week or has a meeting within 30 days; or the impact is high and a meeting is within 7 days.
- **Monitor:** it moved this week, has a meeting within 30 days, the client wants it changed, or the impact is high.
- **Watch:** none of the above, or the bill is closed.

The assistant considers a decision only for a followed bill at Act now, and then names one person to persuade (see the decision rule in `agent/agent.ts`). Risks and opportunities are tagged the same way, with impact (high, medium) and urgency (imminent, in progress, ongoing) or a due date. `billRiskScore` stays in the schema with its formula published; it feeds `issueExposure` and is listed on the Ontology screen as a function.

## Known failure, and the amendment
The first rule required a stage change in the week. In the sample world that left Moru Foods' meat terms restriction bill at Engage: the client opposes it, the impact is high, and the bill review subcommittee takes it up in two days, but nothing had moved since it was placed on the agenda. Any consultant would call that urgent. A bill that sits on an agenda can still be voted on, and a move in the past week is a poor proxy for that. The rule now also treats an opposed, high-impact bill with a meeting within 7 days as Act now, without a move. An amend stance still needs a move, because a bill the client only wants adjusted is less likely to need a meeting this week if nothing has changed. Wrenfield Pay's local presence bill (opposed, high impact, full committee in three days) reaches Act now under the same clause.

Other gaps remain: a bill can be added to an agenda at a day's notice, after the weekly run; a meeting can be cancelled; and the rule knows nothing about how contested a bill is. The confirmation queue and the consultant's own reading have to cover these.

## Second amendment: notice periods and the reasons shown
The rules only looked at meetings. The government bill on sidewalk operation standards had no meeting scheduled, so the bill page said "No meeting scheduled in the next 30 days" while its comment period closed in three weeks and This week listed the same notice as a high-impact opportunity. For a government bill in legislative notice, the close of the notice period is the step that matters: after it the text is fixed and submitted. A **step** is now either a committee, subcommittee or plenary meeting with the bill on the agenda, or the close of an open notice period, and the 7- and 30-day tests apply to the nearest step. Act now still needs a meeting for the assistant to raise a decision, because only a meeting has agenda-setters to persuade.

The bill page now shows the facts in two lists: **Why it matters** (facts that raise the level: a move, a step within 30 days, a stance that wants change, high impact) and **Why not higher** (facts that hold it back). The sidewalk standards bill reads Monitor with the notice deadline under Why it matters and "no position on this bill yet" under Why not higher; once the consultant's request to amend is approved it reaches Engage.

## Consequences
- An executive sees the reason a bill is urgent in the words a consultant would use, and can dispute a specific fact.
- Escalation does not depend on tuning a threshold.
- Four levels lose ordering within a level; the screens sort by level, then by days to the next step.
- The rules are judgment written down. They are tested (`tests/functions.test.ts`, `tests/agent.test.ts`) but not fitted to outcomes, and a deployment should review them against real bill histories.
