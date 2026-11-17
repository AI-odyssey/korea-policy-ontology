# Walkthrough: one week for Aster Robotics

All clients, people, bills and events are fictional. Every value below comes from running the code on the committed `data/world.json`: a fresh `Store`, then `openWeek(store, [all three clients])` (the weekly assistant for each client, with filing on, plus one consultant request), then the engagement lead's actions in the Aster workspace. That is what the demo does when it opens.

## The setting

**Client.** Aster Robotics runs sidewalk delivery robots. Since November 2023, Korean law has let a robot certified under the Intelligent Robots Act use sidewalks as a pedestrian, within 500 kg, 15 km/h and a width limit, and its operator must carry insurance. Aster's issues are the amendments to that framework now in the Assembly. As of Monday, 2026-11-16:

| Issue | Impact on Aster | Aster's position |
|---|---|---|
| Sidewalk rules for outdoor mobile robots (`iss-01`) | high | amend, on the sidewalk robot duties bill |
| Operation safety certification (`iss-02`) | high | support |
| Insurance for robot operators (`iss-03`) | medium | amend |
| Local pilot zones for robots (`iss-04`) | medium | support, on the robot pilot zones bill |

The engagement (`eng-aster`) follows those four issues and six bills.

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

- **Six stage changes**, two on Aster bills: `bill-005` (foreign test results) went into subcommittee review on 11-10, and `bill-001` passed the subcommittee on 11-12. The other four are Moru Foods' novel food bills and a government food bill.
- **48 items collected:** 15 news, 13 notices, 12 press releases, 6 bill tracker updates, 2 sets of minutes. All 48 were new before the assistant ran.
- **Five meetings held and six in the next seven days**, including the Public Administration and Security Committee meeting on 11-19.

Two items carry the sidewalk bill's week: `sig-129`, the bill tracker update of 11-12 ("Bill 22-S0308 passed the bill review subcommittee"), and `sig-133`, the committee's meeting notice of 11-13 listing the bill for 11-19.

## The assistant's run

The assistant runs with a context that sees the public record and Aster's layer only. The Assistant run screen shows its steps in these words:

| Step | Result |
|---|---|
| Read new items | 48 new items since the last report. |
| Sort new items | 18 items concern Aster Robotics: 17 clear matches and one to confirm. Five items look unrelated to any tracked issue. |
| File clear matches | Filed 17 clear matches and set aside five unrelated items. One item waits for you to confirm. |
| Check what changed | Two stage changes on bills that affect Aster Robotics. Across the Assembly, five meetings held and six in the next seven days. |
| Rank followed bills | Most pressing: Sidewalk robot duties bill (act now); Robot insurance committee alternative (engage); Foreign test results bill (monitor). |
| Find who decides next | Sidewalk robot duties bill: the full committee meets on Nov 19. Jang Sora (secretary, high influence) is unconfirmed. |
| Raise a decision | Raised: Meet Jang Sora, a secretary of the Public Administration and Security Committee, before the full committee takes up the sidewalk robot duties bill? |
| Propose a risk | Proposed a risk: Robot insurance committee alternative at the Legislation and Judiciary Committee. It waits for your approval. |
| List deadlines | 16 dated items in the next 30 days; first: Cargo model width and stopping-distance data (Nov 17). |
| Rank issues | Issues with the most at stake: Sidewalk rules for outdoor mobile robots; Insurance for robot operators; Operation safety certification. |
| Summary | No language model is used. The report is built from the template. |
| Draft the weekly report | Drafted the weekly report from nine source documents. |
| Send for review | Sent the report to you for review. |
| Stop for approval | Stopped. Three items wait for your approval; the assistant cannot approve or send. |

**Triage.** Issue keywords and the bill number 22-S0308 put `sig-129` on the sidewalk issue, with links proposed to `iss-01`, `bill-001`, the committee and its subcommittee. Its weight for Aster comes from Aster's own keywords on the Settings screen: "sidewalk" (high priority) and "Road Traffic Act" (low), plus the bill number, give 0.97. The city's sidewalk repaving notice also says "sidewalk", but Aster's profile ignores that word when "repaving" appears, so the notice never reaches Aster. The assistant files only clear matches that concern its own client, plus noise; the 17 filed items appear on This week under **Filed automatically (17)**, each with **Undo**. The one below 0.8 waits under **New items to confirm**.

## Why the sidewalk bill is "Act now"

`responseLevel` puts each followed bill in one of four categories by explicit rules ([ADR-0009](decisions/ADR-0009-categorical-response-levels.md)):

- **Act now:** on a committee, subcommittee or plenary agenda within 7 days, the client wants it changed (oppose or amend), and either it moved this week or the client opposes it and the impact is high.
- **Engage:** the client wants it changed and it moved this week or has a meeting within 30 days; or high impact with a meeting within 7 days.
- **Monitor:** it moved this week, has a meeting within 30 days, the client wants it changed, or the impact is high.
- **Watch:** none of the above, or the bill is closed.

| Followed bill | Stage | Level | Reasons |
|---|---|---|---|
| Sidewalk robot duties bill (22-S0308) | passed the subcommittee | Act now | moved 11-12; full committee 11-19, in 3 days; stance amend; impact high |
| Robot insurance committee alternative (22-S0518) | in Legislation and Judiciary review | Engage | no move; LJC meeting 11-23, in 7 days; stance amend (on the issue); impact medium |
| Foreign test results bill (22-S0336) | in subcommittee review | Monitor | moved 11-10; subcommittee 11-24, in 8 days; stance support (on the issue); impact high |
| Pedestrian priority zones bill (22-S0315) | on the committee agenda | Monitor | no move; subcommittee 11-26, in 10 days; no stance; impact high |
| Robot pilot zones bill (22-S0378) | on the committee agenda | Monitor | no move; subcommittee 11-24, in 8 days; stance support; impact medium |
| Government bill on sidewalk operation standards (no number yet) | legislative notice | Monitor | no move; no meeting in 30 days; no stance; impact high |

The government bill has no number because the Assembly assigns one only when the government submits it, after the 40-day notice.

For comparison, `billRiskScore` (internal; not shown to the client) moved like this:

| Component | Weight | 2026-11-09 | 2026-11-16 |
|---|---|---|---|
| Stage progress | 40 | 0.5 (subcommittee): 20 | 0.62 (subcommittee passed): 24.8 |
| Committee calendar | 20 | subcommittee in 3 days: 20 | full committee in 3 days: 20 |
| Client position | 20 | amend, 0.7: 14 | amend, 0.7: 14 |
| Issue impact | 20 | high: 20 | high: 20 |
| **Total** | 100 | **74** | **78.8** |

The score rose by 4.8 in the week the bill most needed action.

## The decision the assistant raised

The rule: for a followed bill at Act now, take the people who control the agenda of its next meeting (`stageGates`), and pick one the client rates high influence whose stance is opposed or unconfirmed, unless an open plan step already targets that person. For the full committee on 11-19 those people are Seo Haeun (chair, supportive, already the subject of the open step "Meet Seo Haeun's office on the cargo class"), Ryu Taehwan (secretary, supportive, subject of "Brief Ryu Taehwan on the slow-and-yield wording") and Jang Sora (secretary, unconfirmed, high influence). Jang Sora is the one left.

`dec-r001`, marked `CLIENT:cli-aster`, linked by `raised_by` to `sig-133` (the meeting notice), due 2026-11-18:

> **Question.** Meet Jang Sora, a secretary of the Public Administration and Security Committee, before the full committee takes up the sidewalk robot duties bill?
>
> **Recommended.** Yes. Jang Sora agrees the full committee agenda with the chair and has not taken a public position on the bill. Aster Robotics backs sidewalk access for cargo-class robots and wants the stop rule replaced by a duty to slow to walking pace and give way.
>
> **Alternatives.** 1) Send Aster Robotics' proposed wording to Jang Sora's office instead of meeting. 2) Accept the bill as it stands and stop pressing for changes.

The second alternative is the trade the executive is really weighing: accept the stop rule to keep the cargo class. It is the only item under **Decisions needed** on This week, below the headline "The sidewalk robot duties bill goes to the full committee on Nov 19".

The assistant also found that the robot insurance committee alternative, which Aster wants amended, goes to the Legislation and Judiciary Committee on 11-23 and has no risk on record, so it proposed one. Proposals from the assistant wait for the lead.

## Who decides, and who matters

`stageGates(view, 'bill-001')`, shown under **Who decides at each stage** on the Stakeholders screen:

| Stage | Status | Date | Deciders |
|---|---|---|---|
| Bill review subcommittee | done | passed 11-12 | Ryu Taehwan (chair; the majority secretary) |
| Full committee | next | 11-19, scheduled | Seo Haeun (chair), Jang Sora, Ryu Taehwan (secretaries) |
| Legislation and Judiciary Committee | later | not scheduled | Joo Hayul (chair), Na Yerin, Woo Dahyun (secretaries) |
| Plenary | later | not scheduled | floor vote |

`keyPeople(view, 'bill-001')` ranks Ryu Taehwan first (9 points: cosponsor, committee secretary, subcommittee chair, named in two items about the bill), then Baek Siwoo (7: lead sponsor), Seo Haeun (5.5) and Jang Sora (4).

`stakeholderNetwork(view, 'cli-aster', 'iss-01')` returns Aster's nine assessed stakeholders on the sidewalk issue and 19 edges between them (3 cosponsorships, 7 shared committees, 9 joint events involving an organization). Seven have a stance; two are unconfirmed. Jang Sora's panel shows stance **Unconfirmed**, influence High, and "Minority secretary of the committee. No public statement on the bill."

The Strategy screen shows the plan for the issue: the outcome ("Aster Robotics runs cargo models on city sidewalks next year under a yield rule its robots already meet"), three messages, three people to persuade (Jang Sora, the Pedestrian Rights Network, Nam Eunbi), two allies, and six dated steps, one of them a meeting with the Pedestrian Rights Network, the only organization opposed.

## The engagement lead works through the week

**Waiting for your approval.** Two requests sit at the top of This week: "New risk: Robot insurance committee alternative at the Legislation and Judiciary Committee", requested by the assistant, and "Change the client position on the government bill on sidewalk operation standards to Amend", requested by a consultant. **Approve** on each runs the request as its requester with `approvedBy` set to the lead.

**New items to confirm.** Two Aster items are below 0.8: `sig-120` (an industry forum warning on robot operator duties, 0.45) and `sig-126` (a city sidewalk repaving schedule, 0.7). **Confirm** on `sig-120` runs `triageSignal` as the lead: links to `iss-01`, Nam Eunbi and the industry forum, each with an Evidence record of method `human`, status `accepted`. The activity-log entry is marked `CLIENT:cli-aster`; Moru's log does not show it.

**The decision.** **Approve** runs `resolveDecision` with resolution `approve`. A follow-up task appears on the timeline: "Follow up: Meet Jang Sora, a secretary of the Public Administration and Security...", owner `human`, due 2026-11-18, the day before the committee meets.

**The report.** On Reports, the assistant's draft `del-r001`, "Weekly report, week ending 2026-11-16", is **In review**. It follows This week in memo form: the headline, then Risks, Opportunities, Coming up, Stakeholder moves and What we need from Aster Robotics, with nine footnotes, each a source document (a meeting notice, the legislative notice, news items). It leaves out the open decision and the team's own tasks. **Approve** runs `approveDeliverable`; **Send to client** then runs `sendDeliverable`. The status becomes `sent` and nothing leaves the browser.

Two refusals the runtime enforces even though the screen never offers the button: the assistant calling `sendDeliverable` gets `PERMISSION_DENIED`, and anyone sending before approval gets `PRECONDITION_FAILED: Blocked until the principal approves the deliverable`. Both are written to the log.

## The activity log for the week

The Aster workspace shows 32 entries after these steps. The assistant's run accounts for 26: 21 filings and set-asides, the decision, the risk proposal (waiting), the draft and the review step. Then:

| Who | What | Result | Approved by |
|---|---|---|---|
| Consultant | Set the client position on the government bill on sidewalk operation standards to amend | Waiting for approval | |
| Engagement lead | Filed: Metro Robotics Industry Forum warns against rushing robot operator duties... | Done | |
| Assistant | Proposed a risk: Robot insurance committee alternative at the Legislation and Judiciary Committee | Done | Engagement lead |
| Consultant | Set the client position on the government bill on sidewalk operation standards to amend | Done | Engagement lead |
| Engagement lead | Approved a decision: Meet Jang Sora... | Done | |
| Engagement lead | Approved: Weekly report, week ending Nov 16 | Done | |
| Engagement lead | Sent to the client: Weekly report, week ending Nov 16 | Done | Engagement lead |

Every row is marked `CLIENT:cli-aster`. An approved request is logged twice: once when it was asked for, once when it ran with the approver. The sent row's approver is taken from the deliverable, so it names whoever approved the report even if someone else pressed send.

## Switch the workspace to Moru Foods

Choose Moru Foods at the top. None of Aster's decision, report, assessments, strategy or log entries is visible, and the links filed on `sig-120` are visible only as public links on a public item, with no sign of which client filed them. Moru's page leads with its own week: the meat terms restriction bill goes to the bill review subcommittee on Nov 18, and the assistant asks whether to meet the subcommittee chair first.
