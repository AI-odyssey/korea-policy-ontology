# Case study: an ontology for a company's government-affairs team

All companies, people, bills and events in this repository are fictional, and numbers refer to the synthetic world. No company or employer data or documents were used: the world is generated from a seed.

This is a self-directed proof of concept. It has not been deployed or piloted, and it has no users or results. I built it to test how my government-affairs experience translates into designing an operational system.

The app is a tool that a company's in-house government-affairs (대관) team uses directly. I designed it as the person who would build and deploy such a system for that team, not as its daily user. The three fictional companies (Aster Robotics, Moru Foods, Wrenfield Pay) are three example deployments of the same system.

## 1. The problem I kept running into

I have worked in government affairs: watching legislation and regulation, deciding what matters to the organization it concerns, and turning that into advice and documents. After a while the hard part of the work is no longer the judgment calls. It is everything that happens before and after them.

A typical week has these inputs: bill status changes on the Assembly's bill information system, ministry press releases, legislative notices with a comment window (40 days for most government bills), committee and subcommittee agendas, minutes, hearing and audit schedules, seminars hosted by lawmakers' offices, and news. They arrive in different places and formats, and most are irrelevant to the company the team works for.

Where the time goes, in the order I noticed it:

1. **Reading to find out whether something matters.** Most of an item's cost is the minute spent deciding it is not about the company. Multiply by hundreds.
2. **Re-deriving context.** Who is on this subcommittee, who sponsored this, what happened to the last bill on this topic. The answer exists, scattered across tabs and notes, and the team rebuilds it each time.
3. **Missing an event because it was a line in an agenda.** A bill is placed on a subcommittee agenda with a few days' notice. If the team finds it after the meeting, the useful window for a meeting request has closed.
4. **Turning judgment into documents.** The weekly report and issue briefs are mostly facts the team already knows, assembled with sources in a house format.
5. **Talking to executives in the wrong unit.** A company's executives do not want a bill tracker. They want to know what they must decide this week, what could hurt or help the company, when things happen and what the government-affairs team needs from other teams. Translating a tracker into that is a weekly rewrite.
6. **Keeping confidential work confidential.** How the company reads a lawmaker must not leak into a shared layer, and none of it should reach a tool that should not hold it. The system also has to let several deployments share the public record without sharing anything else.

Each of these comes down to structure. The facts have no stable identity, the links between them are not recorded with their evidence, and the rules about who may see and decide what live in people's heads.

## 2. Why an ontology

I tried the obvious things first.

**A dashboard of bills.** It answered "what is the status of bill X" and little else. The questions the team actually asks cross object types: which of the company's issues have a bill moving this week, who on that subcommittee has spoken on it, what did we tell leadership last time. A dashboard hard-codes one path through those relations, so each new question is new work.

**A chatbot over documents.** It was fluent and could not be trusted with the parts that matter. It could not say why it linked a news item to a bill, it had no notion of a confidentiality boundary, and it would mix two companies' material if both were in context. Retrieval over text does not give identity (is this the same subcommittee chair as last month?), time (who held the role on that date?) or permissions.

What I wanted was a small, explicit model of the domain that people and software both operate on: objects with identity, links with evidence, actions with rules, and functions that compute the same answer every time. Screens, reports and the assistant all read and write through it.

## 3. How the work decomposed

I started from the nouns and verbs the team already uses, then asked which ones were shared facts and which ones were the company's own judgment.

**Public layer**, which anyone could in principle assemble from public sources: Issue, Bill, Provision, Institution, Person, StakeholderOrg, Event, Signal, Evidence.

**Company layer**, confidential and marked `CLIENT:<clientId>` (the type names keep the word client): Client (the company the deployment serves), Engagement (the team's monitoring setup), ClientPosition, Interaction, Deliverable, Decision, Task, StakeholderAssessment, RiskOpportunity, Strategy, MonitoringProfile, PilotEvaluation, SignalTriage.

Links carry direction, cardinality and whether evidence is mandatory. Links between public objects need at least one Evidence record. Time is explicit: `Bill.stageHistory`, `since` and `until` on `member_of`, `Signal.collectedAt`. That is what makes `whatChanged(since)` a computation. The full schema is in [docs/ontology.md](docs/ontology.md).

Four choices in the company layer follow from how I expect leadership and the government-affairs team to use the material.

**The company's read of a person belongs to the company.** Whether a committee secretary is supportive, neutral or opposed on sidewalk robots is the company's judgment, based on what it has seen. If stance were a property of `Person`, that judgment would sit in the shared layer and show up in every other deployment. So it is a `StakeholderAssessment` in the company's layer: subject, issue, stance, influence, relevance, the records the stance rests on, who assessed it and when ([ADR-0010](docs/decisions/ADR-0010-client-judgments-in-client-layer.md)).

**Judgment on screen is a category with reasons.** The schema still has `billRiskScore`, a published weighted sum. Nobody reading the screens sees it. They see **Act now**, **Engage**, **Monitor** or **Watch**, and the facts that put the bill there: it moved this week, the committee meets in three days, the company wants it amended, the issue's impact is high. An executive can argue with a fact. A number invites false precision and hides which input moved; in the walkthrough the sidewalk bill's score rose only 4.8 points in the week it most needed action ([ADR-0009](docs/decisions/ADR-0009-categorical-response-levels.md)).

**The weekly view is built for the head of government affairs and for leadership.** The landing screen follows the order leadership reads: one headline and a sentence, the decisions for leadership (question, recommendation, alternatives, due date, buttons), risks and opportunities tagged by impact and urgency, a timeline of what happens next and who owns it, which stakeholders moved, and what the team needs from other teams. `RiskOpportunity` and `Task` with owner `client` (a task for another team in the company, such as product data from Engineering) exist because that page needed them. The weekly report renders the same model in memo form, written by the government-affairs team for the company's leadership, so the page and the report never disagree.

**People own judgment.** A stance other than `unconfirmed` must cite at least one record (a sponsorship, a statement at an event, a news item, a meeting), and `assessStakeholder` is open to analysts and the head of government affairs only. The assistant can collect the records a stance would rest on. It cannot decide what a person thinks. The same rule runs through the rest of the company layer: the assistant may propose a risk, but the head of government affairs approves it; it may draft a report, but it cannot approve or send it; it may raise a decision, but only the head of government affairs records the call.

### Alternatives I rejected

**Issue as a tag.** My first system used tags on bills. It broke on the second company. An issue such as the sidewalk rules for outdoor robots has bills, hearings, ministries and stakeholders, and a different weight for each company. A tag cannot hold links, be watched by a monitoring setup, or carry an impact per company. Cost of making it an object: someone has to maintain the issue list. I accept that, because maintaining it is the team's real analytical work.

**One graph for all companies.** A single graph with a company property is easy to build and easy to leak from. I separated a shared, evidence-backed public layer from company layers behind markings. Company objects point into the public layer; public objects never point into a company layer. One action call may touch only one company layer. Cost: a slightly more awkward query model. Benefit: the leak test is simple to state and to write.

**Stance on Person.** Covered above. The cost is one more object type and a join on every stakeholder screen.

**A risk score on screen.** Covered above. I kept the score as an internal function with its formula published.

**Letting the assistant send.** An assistant that drafts saves time; an assistant that sends is a liability, because one wrong message to leadership or an official costs more than all the time saved. Sending needs an approved deliverable, and only the head of government affairs approves. A company position, a risk or opportunity, and a strategy change from anyone other than the head of government affairs wait for that review.

**Signal as a tag on a link.** The raw item is a first-class object with its original text, and Evidence points at it. When a link is questioned, the answer is an excerpt and a source.

**A model for triage.** Rules handle most items: a bill number in the text, an issue keyword, a known name. Issue keywords decide which issue an item is about; how much it matters to the company comes from the company's own keywords, each with a priority, synonyms and phrases that cancel it. An exact bill number alone gives 0.9 confidence. The assistant files clear matches (0.8 or above) for its company and lists them on This week, where any one can be undone; anything below 0.8 is shown to a person as "New items to confirm" and feeds no report, move or decision until someone confirms it. Filing is a `SignalTriage` record in the company's layer, never an edit to the shared item, so each company's queue depends only on that company's work. There is no model in the triage path. The only place a language model could be used is a two-sentence summary in the weekly report, behind a provider gate, and the adapter is off by default.

## 4. Actions and the approval loop

Actions are the only way state changes. Each declares its parameters, the roles allowed to run it, whether approval is required and by whom, its preconditions, and its side effects. The permission matrix is generated from the schema into [docs/ontology.md](docs/ontology.md#permission-matrix), and a test runs every action as every role against it.

| Role | What it does |
|---|---|
| `system` (collector) | `updateBillStage`, and nothing else |
| `agent` (assistant) | Triage signals, link evidence, draft and submit deliverables, raise decisions, create tasks, propose risks and opportunities (approval needed) |
| `consultant` (analyst on the team) | Everything a person does day to day, including stakeholder assessments, contacts, undoing a triage and sending an approved report; position and strategy changes wait for the head of government affairs |
| `principal` (head of government affairs) | Approves deliverables, records leadership's decisions, approves pending requests |

The split I was after: rules first, the assistant where rules can move work forward, a person wherever judgment or accountability is needed. The assistant's job is to move work to the point where a human decision is cheap.

The decision it raises is a good example. A generic "request a meeting with the chair" is a template an analyst would throw away. The assistant instead looks at the bill's next meeting, takes the people who control that agenda from `stageGates`, and picks the one the company rates high influence whose stance is opposed or unknown, skipping anyone a plan step already covers. For Aster that is Baek Siwoo, the lead sponsor, because the committee chair and the subcommittee chair already have plan steps. The question names him, the recommendation says why he matters and what Aster wants, and one alternative states the real trade: accept the stop rule as passed to keep the cargo class. The follow-up task is due before the meeting, with a working day left to act.

Two kinds of item wait for a person, and they are kept apart. Approvals are what the assistant or an analyst changed or drafted; each sits next to what it changes (a proposed risk among the risks, a position change under its issue, a report on Reports), and the head of government affairs approves or declines it there. **Decisions for leadership** are business calls, such as who from the company meets a lawmaker, which the head of government affairs puts to leadership and records.

When the demo opens, two items already wait for the head of government affairs at Aster, each labeled with who prepared it: a risk the assistant proposed and a position change an analyst asked for. Approving one runs it as the requester, with the head of government affairs recorded as approver in the audit log.

## 5. Deploying it for an in-house team

I would start with one workflow and one team: shadow two analysts through a Monday, agree the issue list and the one-page leadership view with the head of government affairs, run the public layer read-only with rules and measure how many proposals analysts accept, then add the company's layer and make the weekly report the first deliverable. The report is frequent, templated and low-risk, because a person approves every one. A second deployment comes only after the first one's report time and miss rate improve, since it is the real test of the markings. Before any company layer goes live, the company's confidentiality and vendor rules have to be written into the provider allow-list; that conversation with security and legal takes longer than the engineering.

### What a pilot would measure

| Metric | Why |
|---|---|
| Time from an item's arrival to a triage decision | The most direct measure of reading cost |
| Missed events (agenda items or deadlines found after the fact) | The failure that costs the company most |
| Analyst minutes per weekly report | What the team will feel |
| Days from a bill moving to a decision put to leadership | Whether the weekly view does its job |
| Share of assistant filings undone, and of decisions declined | Where the rules need work |
| Share of stances backed by a record less than 60 days old | Whether the stakeholder map is kept honest |
| Access attempts across company layers blocked, and any leak found | Must stay at zero leaks |

None of these has been measured. Baselines have to be measured by hand first, and I would not promise targets before measuring.

## 6. What failed along the way

**A risk score that missed the week that mattered.** The first version raised a decision when a bill's score rose ten points in a week. The sidewalk bill cleared the subcommittee and faced the full committee three days later, and its score rose 4.8. The calendar component had been full the week before. Response levels replaced the score on screen.

**A response rule that needed movement.** The first categorical rule required a stage change in the week. Moru Foods' meat terms bill, which the company opposes and which a subcommittee takes up in two days, sat at Engage because nothing had moved since it was placed on the agenda. The rule now treats an opposed, high-impact bill with a meeting within seven days as Act now ([ADR-0009](docs/decisions/ADR-0009-categorical-response-levels.md)).

**A shared triage queue.** The first version marked an item as filed on the shared `Signal` itself. Whichever company's assistant ran first emptied the queue for the others, so the same week showed 48, 26 and 16 new items depending on the company. Filing now lives in each company's layer.

**Templated decisions.** The assistant's first decisions all read "Request a meeting with the chair's office". They ignored who had already been met and who actually held the vote, and they duplicated steps already in the plan. Selecting the target from the agenda-setters and the company's own assessments fixed both.

**A report that duplicated a tracker.** The first weekly report was a bill table with risk scores and a "Who matters" list cited to ontology ids. It repeated the tracker instead of the brief, and I expect a leader who has read This week to skip a table like that. The report now renders the same brief and cites source documents.

**Synthetic data that did not match the law.** An early version of the world had robots seeking sidewalk access that Korean law already granted in 2023, insurance bills in the wrong committee, a committee alternative existing before the committee adopted it, and committee chairs in their first term. A reader who knows the Assembly would stop trusting the demo at the first of these, so the generator now follows jurisdiction, seniority and procedure.

### What an outside review changed

I had the model reviewed from two sides, an ontology architect's and a hiring panel's. Four changes came out of it:

- **One writer for the public layer.** A company user could attach evidence that landed in the shared public layer, so one company's filing showed in another's view. Now only the collector writes public links; anyone else files a link for one company, under that company's marking.
- **Link rules enforced on every write.** Required link properties and one-to-many limits were checked only by the offline validator. They now run in the write path, so an action cannot create a membership without a role or a second lead sponsor.
- **Judgments as records.** How strongly an issue touches a company was a property on a link with no author or reason, yet it drives the response level. It is now an ImpactAssessment with a rationale, an assessor and an approver, changed only through an action that needs approval. The purpose of an agenda item (introduction, review, vote) is recorded from the notice instead of inferred from the bill's current stage, and each collected stage change keeps the record it was read from.
- **Decisions that know what they rest on.** A decision now links to the meeting, the assessment of the person to persuade, the company position and the impact rating, and remembers their values. If the meeting moves or the position changes, it shows as out of date. The This week screen opens that chain from the headline.

### Features I dropped

- **A role switch on screen.** Showing analyst and head-of-government-affairs views side by side would explain the model to engineers but ask the person using the tool to learn roles they do not need. The viewer is the head of government affairs; the roles stay in the ontology and the activity log.
- **A quadrant chart of stakeholders, movement arrows and target-stance outlines.** They look analytical and invite readers to treat a judgment as a measurement. The network keeps size, color and line style only.
- **A bill table on the landing page.** It moved to Issues & bills.
- **Model-written triage.** Rules plus a person cover the volume in the sample world, and a model adds a data path that needs its own controls.

## 7. Risks and limits

- **Fictional week, real snapshot beside it.** The companies, people, bills and the assistant's week run on generated data. Real public records (bills, minutes, notices, the Official Gazette, press releases and news headlines) are collected for each company's profile and shown from a committed snapshot, but kept apart from the fictional store: the assistant does not yet triage them, so the run shows structure and control flow rather than behavior on noisy real sources.
- **Ontology maintenance cost.** The issue list, keywords and stakeholder assessments need an owner. If nobody owns them, linking quality and stance accuracy decay.
- **Hand-set rules.** The response-level rules, the decision rule and the risk-score weights are explicit and tested, but they are my judgment written down, not fitted to outcomes.
- **Rules are brittle at the edges.** Aliases, renamed committees and amended bill titles will cause misses. The confirmation queue and the undo are the safety net.
- **No real authentication.** The viewer is fixed as the head of government affairs. A real deployment needs identity, and the caller-context filter must run on a server behind it.
- **Browser state.** State lives in memory with a localStorage copy. Multi-user concurrency and durable storage are not addressed.
- **No model in the shipped build.** The adapter and the provider gate exist and are tested, but model quality is not shown here.
- **Tacit knowledge is not captured.** The ontology records what happened, what the team decided and why it reads a person a certain way. It does not hold an analyst's feel for a particular office.

## 8. What is next

1. Let the assistant triage the live public records behind the same Signal interface, and measure precision per company against the trial's relevance calls.
2. A server-side runtime with real identity, so the markings are enforced behind authentication instead of in a browser.
3. An evaluation set for triage: labeled items, measuring rule precision and where a model would help.
4. Staleness rules for stakeholder assessments: flag a stance whose newest basis record is old.
5. A review of the response-level and decision rules against a year of real bill histories.
6. Route the model choice for each drafting job through a task router, under the provider gate.
