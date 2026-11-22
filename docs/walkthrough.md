# Walkthrough: one week for Aster Robotics

All companies, people, bills and events are fictional. Every value below comes from running the code on the committed `data/world.json`: a fresh `Store`, then `openWeek(store, [all three companies])` (the weekly assistant for each company, with filing on, plus one analyst request), then the head of government affairs' actions in the Aster workspace. That is what the demo does when it opens.

## The setting

**The company.** Aster Robotics runs sidewalk delivery robots. Since November 2023, Korean law has let a robot certified under the Intelligent Robots Act use sidewalks as a pedestrian, within 500 kg, 15 km/h and a width limit, and its operator must carry insurance. Aster's issues are the amendments to that framework now in the Assembly. As of Monday, 2026-11-16:

| Issue | Impact on Aster | Aster's position |
|---|---|---|
| Sidewalk rules for outdoor mobile robots (`iss-01`) | high | amend, on the sidewalk robot duties bill |
| Operation safety certification (`iss-02`) | high | support |
| Insurance for robot operators (`iss-03`) | medium | amend |
| Local pilot zones for robots (`iss-04`) | medium | support, on the robot pilot zones bill |

The government-affairs team's monitoring setup (`eng-aster`) follows those four issues and seven bills.

**The bill that matters this week.** The sidewalk robot duties bill, `bill-001`, number 22-S0308, "Act Partially Amending the Road Traffic Act (Cargo-Class Robots and Operator Duties on Sidewalks)". It would let certified cargo-class robots up to 1,000 mm wide use sidewalks at least 3 m wide; the subcommittee added a duty to stop for any pedestrian within 2 m. Lead sponsor: Baek Siwoo. Referred to the Public Administration and Security Committee (`inst-pasc`).

| Date | Stage |
|---|---|
| 2026-09-24 | submitted |
| 2026-09-30 | referred to committee |
| 2026-10-20 | placed on the committee agenda |
| 2026-10-29 | in the bill review subcommittee |
| 2026-11-12 | passed the bill review subcommittee (`evt-001`, held) |
| 2026-11-19 | full committee meeting scheduled (`evt-016`) |

**The process.** After the bill review subcommittee comes the full committee vote, then the Legislation and Judiciary Committee's systematic and wording review, then the plenary. Most amendments are made in the subcommittee; once a bill has cleared it, the full committee meeting is the last easy point to ask for a change.

## Monday morning: what changed

`whatChanged(view, '2026-11-09')` returns the week:

- **Seven stage changes**, two on Aster bills: `bill-005` (foreign test results) went into subcommittee review on Nov 10, and `bill-001` passed the subcommittee on Nov 12. The other five are Moru Foods' novel food bills (three lawmaker bills and a government bill, reviewed together, which passed the subcommittee on Nov 12) and Wrenfield Pay's local presence bill, which the full committee placed on its agenda.
- **49 items collected:** 15 news, 13 notices, 12 press releases, 7 bill tracker updates, 2 sets of minutes. All 49 were new before the assistant ran.
- **Five meetings held and nine in the next seven days**, including the Public Administration and Security Committee meeting on Nov 19.

Two items carry the sidewalk bill's week: `sig-130`, the bill tracker update of Nov 12 ("Bill 22-S0308 passed the bill review subcommittee"), and `sig-135`, the committee's meeting notice of Nov 13 listing the bill for Nov 19.

## The assistant's run

The assistant runs with a context that sees the public record and Aster's layer only. The Audit log screen shows its steps in these words:

| Step | Result |
|---|---|
| Read new items | 49 new items since the last report. |
| Sort new items | 18 items concern Aster Robotics: 17 clear matches and one to confirm. Five items look unrelated to any tracked issue. |
| File clear matches | Filed 17 clear matches and set aside five unrelated items. One item waits for you to confirm. |
| Check what changed | Two stage changes on bills that affect Aster Robotics. Across the Assembly, five meetings held and nine in the next seven days. |
| Rank followed bills | Most pressing: Sidewalk robot duties bill (act now); Foreign test results bill (engage); Coverage by weight class bill (engage). |
| Find who decides next | Sidewalk robot duties bill: the full committee votes on Nov 19. Baek Siwoo (the lead sponsor, high influence) can change the text there and is supportive. |
| Raise a decision | Raised: Meet Baek Siwoo, the lead sponsor, before the full committee votes on the sidewalk robot duties bill? |
| Propose a risk | Proposed a risk: Coverage by weight class bill at the bill review subcommittee. It waits for your review. |
| List deadlines | 16 dated items in the next 30 days; first: Cargo model width and stopping-distance data · Engineering (Nov 17). |
| Rank issues | Issues ranked by exposure, the risk of the worst open bill plus a little for each other open bill. This ranking ignores the priority numbers in the monitoring profile: Sidewalk rules for outdoor mobile robots; Insurance for robot operators; Operation safety certification. |
| Write the summary | The summary is written from this week's records, without a language model. |
| Draft the weekly report | Drafted the weekly report from nine source documents. |
| Send for review | Sent the report to you for review. |
| Stop for approval | Stopped. The weekly report and one new risk wait for your review, and one decision waits for leadership. The assistant cannot approve or send. |

**Triage.** Issue keywords and the bill number 22-S0308 put `sig-130` on the sidewalk issue, with links proposed to `iss-01`, `bill-001`, the committee and its subcommittee. Its weight for Aster comes from Aster's own keywords on the Settings screen: "sidewalk" (high priority) and "Road Traffic Act" (low), plus the bill number, give 0.97. The city's sidewalk repaving notice also says "sidewalk", but Aster's profile ignores that word when "repaving" appears, so the notice never reaches Aster. The assistant files only clear matches that concern its own company, plus noise; the 17 filed items appear on This week under **Filed automatically (17)**, each with **Undo**. The one below 0.8 waits under **New items to confirm**. Each filing is a `SignalTriage` record in Aster's layer; the shared items are untouched, so Moru's and Wrenfield's assistants see the same 48 new items.

## Why the sidewalk bill is "Act now"

`responseLevel` puts each followed bill in one of four categories by explicit rules ([ADR-0009](decisions/ADR-0009-categorical-response-levels.md)):

A step is a meeting with the bill on the agenda or the close of an open legislative notice period. It is a decisive step when the text can still change there: the subcommittee's review, the full committee's vote on a bill its subcommittee passed, or the close of the notice period (the last easy moment to file comments; the ministry must consider them but is not bound). The full committee taking up a bill for the first time (상정, no vote) is not a decision. The Legislation and Judiciary Committee only checks wording and can hold a bill back, and the plenary votes on a settled text.

- **Act now:** a decisive step within 7 days, the company wants it changed (oppose or amend), and either it moved this week or the company opposes it and the impact is high.
- **Engage:** the text is still open and the company wants it changed and it moved this week or has a decisive step or a first introduction within 30 days; or high impact with a decisive step or introduction within 10 days, whatever the company's stance.
- **Monitor:** it moved this week, has a step within 30 days, the company wants it changed, or the impact is high. A bill past the full committee stays here at most.
- **Watch:** none of the above, or the bill is closed.

| Followed bill | Stage | Level | Reasons |
|---|---|---|---|
| Sidewalk robot duties bill (22-S0308) | passed the subcommittee | Act now | moved Nov 12; full committee Nov 19, in 3 days; stance amend; impact high |
| Foreign test results bill (22-S0336) | in subcommittee review | Engage | moved Nov 10; subcommittee Nov 23, in 7 days; stance support (on the issue); impact high |
| Coverage by weight class bill (22-S0357) | in subcommittee review | Engage | no move; subcommittee Nov 23, in 7 days; stance amend; impact medium |
| Pedestrian priority zones bill (22-S0315) | on the committee agenda | Engage | no move; subcommittee Nov 26, in 10 days; no stance; impact high |
| Robot pilot zones bill (22-S0378) | on the committee agenda | Monitor | no move; subcommittee Nov 23, in 7 days; stance support; impact medium |
| Robot insurance committee alternative (22-S0518) | in Legislation and Judiciary review | Monitor | no move; wording review Nov 23, in 7 days; stance monitor; impact medium. The text is settled, so Aster only tracks wording and delay risk. It leaves coverage amounts out, and Aster presses those on the weight-class bill, a separate text that adds its own article |
| Government bill on sidewalk operation standards (no number yet) | legislative notice | Monitor | no move; notice period closes 12-07, in 21 days; no stance yet; impact high |

The government bill has no number because the Assembly assigns one only when the government submits it. That comes months after the 40-day notice closes, once regulatory review, the Ministry of Government Legislation, the Cabinet and presidential approval are done, and the text can still change in any of them.

For comparison, `billRiskScore` (internal; not shown on any screen) moved like this:

| Component | Weight | 2026-11-09 | 2026-11-16 |
|---|---|---|---|
| Stage progress | 40 | 0.5 (subcommittee): 20 | 0.62 (subcommittee passed): 24.8 |
| Committee calendar | 20 | subcommittee in 3 days: 20 | full committee in 3 days: 20 |
| Company position | 20 | amend, 0.7: 14 | amend, 0.7: 14 |
| Issue impact | 20 | high: 20 | high: 20 |
| **Total** | 100 | **74** | **78.8** |

The score rose by 4.8 in the week the bill most needed action.

## The decision the assistant raised

The rule: for a followed bill at Act now, take the people who can change its text at the next subcommittee review or full committee vote (the subcommittee chair, then the lead sponsor, then the committee chair; the other secretary only agrees the agenda and can delay, so is never picked), and pick the first one the company rates high influence whose stance fits (opposed or unconfirmed when the company opposes; any stance when it wants amendments, since a supporter can carry the wording), unless an open plan step already targets that person. For the full committee on Nov 19 those people are Ryu Taehwan (chaired the subcommittee that wrote the text, supportive, subject of the open step "Brief Ryu Taehwan on the slow-and-yield wording"), Baek Siwoo (lead sponsor) and Seo Haeun (committee chair, supportive, subject of the open step "Brief Seo Haeun's office on the timing of the committee vote", which is labelled for what it is: a briefing on timing, not a request to change the text). That leaves the lead sponsor, Baek Siwoo. Jang Sora, the other secretary, is never offered: she can only delay.

`dec-r001`, marked `CLIENT:cli-aster`, linked by `raised_by` to `sig-135` (the meeting notice), due 2026-11-17, two working days before the vote (never earlier than the working day after the as-of date; when a meeting is too close for that, the decision shows "Due today"):

> **Question.** Meet Baek Siwoo, the lead sponsor, before the full committee votes on the sidewalk robot duties bill?
>
> **Recommended.** Meet Baek Siwoo before the Nov 19 full committee. Baek Siwoo is the lead sponsor, whose agreement makes a wording change easiest to carry in committee, and supports the bill. Aster Robotics backs sidewalk access for cargo-class robots and wants the stop rule replaced by a duty to slow to walking pace and give way.
>
> **Alternatives.** 1) Send Aster Robotics' proposed wording to Baek Siwoo's office instead of meeting. 2) Accept the bill as it stands and press for the point in a committee supplementary resolution (부대의견) or in the enforcement decree.

The second alternative is the trade leadership is really weighing: accept the stop rule to keep the cargo class. It is the only item under **Decisions for leadership** on This week, below the headline "The sidewalk robot duties bill goes to the full committee on Nov 19".

The assistant also found that the coverage by weight class bill, which Aster wants amended, goes to the bill review subcommittee on Nov 23, where its text can still change, and has no risk on record, so it proposed one. It proposed nothing for the insurance committee alternative: at the Legislation and Judiciary Committee only wording and delay can change. Proposals from the assistant wait for the head of government affairs.

## Who decides, and who matters

`stageGates(view, 'bill-001')`, shown under **Who decides at each stage** on the Stakeholders screen:

| Stage | Status | Date | Deciders |
|---|---|---|---|
| Bill review subcommittee | done | passed Nov 12 | Ryu Taehwan (chair; the majority secretary) |
| Full committee | next | Nov 19, scheduled | Seo Haeun (chair), Jang Sora, Ryu Taehwan (secretaries) |
| Legislation and Judiciary Committee | later | not scheduled | Joo Hayul (chair), Na Yerin, Woo Dahyun (secretaries) |
| Plenary | later | not scheduled | floor vote |

`keyPeople(view, 'bill-001')` ranks Ryu Taehwan first (9 points: cosponsor, committee secretary, subcommittee chair, named in two items about the bill), then Baek Siwoo (7: lead sponsor), Seo Haeun (5.5) and Jang Sora (4).

`stakeholderNetwork(view, 'cli-aster', 'iss-01')` returns Aster's ten assessed stakeholders on the sidewalk issue (five lawmakers, the police agency's traffic safety director, an industry forum, two civic groups and a traffic engineering professor who testified at the hearing) and 13 edges between them: 3 co-sponsored bills, 3 oversight ties (the chair or a secretary of the committee and the official whose agency's rules the committee amends), 1 advisory seat, 5 shared appearances of non-lawmakers at an event on the issue and 1 joint statement of the two civic groups. Shared committee seats show in each lawmaker's role rather than as lines, and lawmakers draw no line to the witnesses at a hearing they chair or question. Eight have a stance; two are unconfirmed. Each edge keeps the ids of the public records it rests on, and the screen draws the five kinds in four line styles. Jang Sora's panel shows stance **Unconfirmed**, impact High, and "Minority secretary of the committee. No public statement on the bill."

The Strategy screen shows the plan for the issue: the outcome ("Aster Robotics runs cargo models on city sidewalks next year under a yield rule its robots already meet"), three messages, four people to persuade (Baek Siwoo, Ryu Taehwan, the Pedestrian Rights Network, Nam Eunbi), two allies, and six dated steps, one of them a meeting with the Pedestrian Rights Network, the only organization opposed.

## The head of government affairs works through the week

**Approvals.** The numbers under the headline show three items waiting: the weekly report, a risk and a position change. "Coverage by weight class bill at the bill review subcommittee", proposed by the assistant, sits at the top of Risks. The analyst's request to change the company position on the government bill on sidewalk operation standards to Amend sits under that issue on Issues & bills. **Approve** on each runs the change as its requester with `approvedBy` set to the head of government affairs.

**New items to confirm.** One Aster item is below 0.8: `sig-121` (an industry forum warning on robot operator duties). The city's sidewalk repaving schedule never reaches Aster, because its profile ignores "sidewalk" next to "repaving". **Confirm** on `sig-121` runs `triageSignal` as the head of government affairs: links to `iss-01`, Nam Eunbi and the industry forum, each with an Evidence record of method `human`, status `accepted`. The activity-log entry is marked `CLIENT:cli-aster`; Moru's log does not show it.

**The decision.** **Approve** runs `resolveDecision` with resolution `approve`. A follow-up task appears on the timeline: "Meet Baek Siwoo before the Nov 19 full committee", owner `human`, due 2026-11-17, two working days before the committee votes. If the head of government affairs had first changed Baek Siwoo's stance, the decision would show **Out of date: stance changed** with **Regenerate**, which withdraws it and raises a new one only if someone on the agenda still needs persuading.

**The report.** On Reports, the assistant's draft `del-r001`, "Weekly report, week ending 2026-11-16", is **In review**. It follows This week in memo form: the headline, then Risks, Opportunities, Coming up, Stakeholder moves and What we need from other teams, with nine footnotes, each a source document (a meeting notice, the legislative notice, news items). It leaves out the open decision and the team's own tasks. The report is rebuilt after every approval, so the risk approved above and the decision just taken are already in it; had the head of government affairs approved the report first, the new risk would have sent it back to review. **Approve** runs `approveDeliverable`; **Send to leadership** then runs `sendDeliverable`. The status becomes `sent` and nothing leaves the browser.

Two refusals the runtime enforces even though the screen never offers the button: the assistant calling `sendDeliverable` gets `PERMISSION_DENIED`, and anyone sending before approval gets `PRECONDITION_FAILED: Blocked until the head of government affairs approves the deliverable`. Both are written to the log.

## The activity log for the week

The assistant's run accounts for 26 entries: 21 filings and set-asides, the decision, the risk proposal, the draft and the review step. The head of government affairs' steps add these rows (newest last):

| Who | What | Result | Decided by |
|---|---|---|---|
| Assistant | Proposed a risk: Coverage by weight class bill at the bill review subcommittee | Approved | Head of government affairs, Nov 16 |
| Analyst | Asked to change the company position on the government bill on sidewalk operation standards to Amend | Approved | Head of government affairs, Nov 16 |
| Assistant | Brought up to date with the latest changes: Weekly report, week ending Nov 16 | Done | |
| Head of government affairs | Filed: Metro Robotics Industry Forum warns against rushing robot operator duties... | Done | |
| Head of government affairs | Approved a decision: Meet Baek Siwoo... | Done | |
| Assistant | Brought up to date with the latest changes: Weekly report, week ending Nov 16 | Done | |
| Head of government affairs | Approved: Weekly report, week ending Nov 16 | Done | |
| Head of government affairs | Sent to leadership: Weekly report, week ending Nov 16 | Done | Head of government affairs |

Every row is marked `CLIENT:cli-aster`. A request that waited for approval stays on the row where it was asked for, which then shows the outcome and who decided; the audit log keeps both entries underneath. The sent row's approver is taken from the deliverable, so it names whoever approved the report even if someone else pressed send.

## Switch the workspace to Moru Foods

Choose Moru Foods at the top. None of Aster's decision, report, assessments, strategy or log entries is visible, and the links filed on `sig-121` are visible only as public links on a public item, with no sign of which company filed them. Moru's page leads with its own week: the meat terms restriction bill goes to the bill review subcommittee on Nov 18, and the assistant asks whether to meet the subcommittee chair first.
