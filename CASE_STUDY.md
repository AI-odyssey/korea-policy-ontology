# Case study: an ontology for a policy consultant's week

All clients, people, bills and events in this repository are fictional, and numbers refer to the synthetic world. No client or employer data or documents were used: the world is generated from a seed.

## 1. The problem I kept running into

I do policy and government-relations work: I watch legislation and regulation for clients, decide what matters to each of them, and turn that into advice and documents. After a while the hard part of the work is no longer the judgment calls. It is everything that happens before and after them.

A typical week has these inputs: bill status changes on the Assembly's bill information system, ministry press releases, legislative notices with a comment window (40 days for most government bills), committee and subcommittee agendas, minutes, hearing and audit schedules, seminars hosted by lawmakers' offices, and news. They arrive in different places and formats, and most are irrelevant to any given client.

Where the time goes, in the order I noticed it:

1. **Reading to find out whether something matters.** Most of an item's cost is the minute spent deciding it is not about my client. Multiply by hundreds.
2. **Re-deriving context.** Who is on this subcommittee, who sponsored this, what happened to the last bill on this topic. The answer exists, scattered across tabs and notes, and I rebuild it each time.
3. **Missing an event because it was a line in an agenda.** A bill is placed on a subcommittee agenda with a few days' notice. If I find it after the meeting, the useful window for a meeting request has closed.
4. **Turning judgment into documents.** The weekly report and issue briefs are mostly facts I already know, assembled with sources in a house format.
5. **Talking to executives in the wrong unit.** A client's executives do not want a bill tracker. They want to know what they must decide this week, what could hurt or help them, when things happen and what we need from them. Translating a tracker into that is a weekly rewrite.
6. **Keeping clients apart.** What I know about one client, including how it reads a lawmaker, must not shape what I write to another, and none of it should reach a tool that should not hold it.

Each of these comes down to structure. The facts have no stable identity, the links between them are not recorded with their evidence, and the rules about who may see and decide what live in my head.

## 2. Why an ontology

I tried the obvious things first.

**A dashboard of bills.** It answered "what is the status of bill X" and little else. The questions I actually ask cross object types: which of this client's issues have a bill moving this week, who on that subcommittee has spoken on it, what did we tell the client last time. A dashboard hard-codes one path through those relations, so each new question is new work.

**A chatbot over documents.** It was fluent and could not be trusted with the parts that matter. It could not say why it linked a news item to a bill, it had no notion of a client boundary, and it would mix two clients' material if both were in context. Retrieval over text does not give identity (is this the same subcommittee chair as last month?), time (who held the role on that date?) or permissions.

What I wanted was a small, explicit model of the domain that people and software both operate on: objects with identity, links with evidence, actions with rules, and functions that compute the same answer every time. Screens, reports and the assistant all read and write through it.

## 3. How the work decomposed

I started from the nouns and verbs I already used with colleagues and clients, then asked which ones were shared facts and which ones were one client's judgment.

**Public layer**, which anyone could in principle assemble from public sources: Issue, Bill, Provision, Institution, Person, StakeholderOrg, Event, Signal, Evidence.

**Client layer**, confidential and marked `CLIENT:<clientId>`: Client, Engagement, ClientPosition, Interaction, Deliverable, Decision, Task, StakeholderAssessment, RiskOpportunity, Strategy, MonitoringProfile, PilotEvaluation, SignalTriage.

Links carry direction, cardinality and whether evidence is mandatory. Links between public objects need at least one Evidence record. Time is explicit: `Bill.stageHistory`, `since` and `until` on `member_of`, `Signal.collectedAt`. That is what makes `whatChanged(since)` a computation. The full schema is in [docs/ontology.md](docs/ontology.md).

Four choices in the client layer follow from how I expect executives and consultants to use the material.

**A client's read of a person belongs to the client.** Whether a committee secretary is supportive, neutral or opposed on sidewalk robots is one client's judgment, based on what that client has seen. If stance were a property of `Person`, that judgment would sit in the shared layer and show up in every other client's work. So it is a `StakeholderAssessment` in the client's layer: subject, issue, stance, influence, relevance, the records the stance rests on, who assessed it and when ([ADR-0010](docs/decisions/ADR-0010-client-judgments-in-client-layer.md)).

**Judgment on screen is a category with reasons.** The schema still has `billRiskScore`, a published weighted sum. A client never sees it. They see **Act now**, **Engage**, **Monitor** or **Watch**, and the facts that put the bill there: it moved this week, the committee meets in three days, the client wants it amended, the issue's impact is high. An executive can argue with a fact. A number invites false precision and hides which input moved; in the walkthrough the sidewalk bill's score rose only 4.8 points in the week it most needed action ([ADR-0009](docs/decisions/ADR-0009-categorical-response-levels.md)).

**The executive weekly view is its own design target.** The landing screen is built for the client's executive, in the order they read: one headline and a sentence, the decisions they must make (question, recommendation, alternatives, due date, buttons), risks and opportunities tagged by impact and urgency, a timeline of what happens next and who owns it, which stakeholders moved, and what we need from the client. `RiskOpportunity` and `Task` with owner `client` exist because that page needed them. The weekly report renders the same model in memo form, so the page and the report never disagree.

**People own judgment.** A stance other than `unconfirmed` must cite at least one record (a sponsorship, a statement at an event, a news item, a meeting), and `assessStakeholder` is open to consultants and the principal only. The assistant can collect the records a stance would rest on. It cannot decide what a person thinks. The same rule runs through the rest of the client layer: the assistant may propose a risk, but the principal approves it; it may draft a report, but it cannot approve or send it; it may raise a decision, but only the principal resolves it.

### Alternatives I rejected

**Issue as a tag.** My first system used tags on bills. It broke on the second client. An issue such as the sidewalk rules for outdoor robots has bills, hearings, ministries and stakeholders, and a different weight for each client. A tag cannot hold links, be watched by an engagement, or carry an impact per client. Cost of making it an object: someone has to maintain the issue list. I accept that, because maintaining it is the consultant's real analytical work.

**One graph for all clients.** A single graph with a client property is easy to build and easy to leak from. I separated a shared, evidence-backed public layer from client layers behind markings. Client objects point into the public layer; public objects never point into a client layer. One action call may touch only one client layer. Cost: a slightly more awkward query model. Benefit: the leak test is simple to state and to write.

**Stance on Person.** Covered above. The cost is one more object type and a join on every stakeholder screen.

**A risk score on screen.** Covered above. I kept the score as an internal function with its formula published.

**Letting the assistant send.** An assistant that drafts saves time; an assistant that sends is a liability, because one wrong message to a client or an official costs more than all the time saved. Sending needs an approved deliverable, and only the principal approves. A client position, a risk or opportunity, and a strategy change from anyone other than the principal wait for the principal.

**Signal as a tag on a link.** The raw item is a first-class object with its original text, and Evidence points at it. When a link is questioned, the answer is an excerpt and a source.

**A model for triage.** Rules handle most items: a bill number in the text, an issue keyword, a known name. Issue keywords decide which issue an item is about; how much it matters to a client comes from that client's own keywords, each with a priority, synonyms and phrases that cancel it. An exact bill number alone gives 0.9 confidence. The assistant files clear matches (0.8 or above) for its client and lists them on This week, where any one can be undone; anything below 0.8 is shown to a person as "New items to confirm" and feeds no report, move or decision until someone confirms it. Filing is a `SignalTriage` record in the client's layer, never an edit to the shared item, so each client's queue depends only on that client's work. There is no model in the triage path. The only place a language model could be used is a two-sentence summary in the weekly report, behind a provider gate, and the adapter is off by default.

## 4. Actions and the approval loop

Actions are the only way state changes. Each declares its parameters, the roles allowed to run it, whether approval is required and by whom, its preconditions, and its side effects. The permission matrix is generated from the schema into [docs/ontology.md](docs/ontology.md#permission-matrix), and a test runs every action as every role against it.

| Role | What it does |
|---|---|
| `system` (collector) | `updateBillStage`, and nothing else |
| `agent` (assistant) | Triage signals, link evidence, draft and submit deliverables, raise decisions, create tasks, propose risks and opportunities (approval needed) |
| `consultant` | Everything a person does day to day, including stakeholder assessments, contacts, undoing a triage and sending an approved report; position and strategy changes wait for the principal |
| `principal` (engagement lead) | Approves deliverables, resolves decisions, approves pending requests |

The split I was after: rules first, the assistant where rules can move work forward, a person wherever judgment or accountability is needed. The assistant's job is to move work to the point where a human decision is cheap.

The decision it raises is a good example. A generic "request a meeting with the chair" is a template a consultant would throw away. The assistant instead looks at the bill's next meeting, takes the people who control that agenda from `stageGates`, and picks the one the client rates high influence whose stance is opposed or unknown, skipping anyone a plan step already covers. For Aster that is Baek Siwoo, the lead sponsor, because the committee chair and the subcommittee chair already have plan steps. The question names him, the recommendation says why he matters and what Aster wants, and one alternative states the real trade: accept the stop rule as passed to keep the cargo class. The follow-up task is due before the meeting, with a working day left to act.

When the demo opens, two requests already wait for the Aster lead, each labeled with who asked: a risk the assistant proposed and a position change a consultant asked for. Approving one runs it as the requester, with the lead recorded as approver in the activity log.

## 5. Deploying it at a firm or an in-house team

I would start with one workflow and one client: shadow two consultants for a Monday, agree the issue list and the executive's one-page view, run the public layer read-only with rules and measure how many proposals consultants accept, then add one client's layer and make the weekly report the first deliverable. The report is frequent, templated and low-risk, because a person approves every one. The second client comes only after the first one's report time and miss rate improve, since it is the real test of the markings. Before any client layer goes live, the firm's confidentiality and vendor rules have to be written into the provider allow-list; that conversation with partners or with security and legal takes longer than the engineering.

### What I would measure

| Metric | Why |
|---|---|
| Time from an item's arrival to a triage decision | The most direct measure of reading cost |
| Missed events (agenda items or deadlines found after the fact) | The failure that costs clients money |
| Consultant minutes per weekly report | What the consultants will feel |
| Days from a bill moving to a decision put to the client | Whether the executive view does its job |
| Share of assistant filings undone, and of decisions declined | Where the rules need work |
| Share of stances backed by a record less than 60 days old | Whether the stakeholder map is kept honest |
| Cross-client access attempts blocked, and any leak found | Must stay at zero leaks |

Baselines have to be measured by hand first. I would not promise targets before measuring.

## 6. What failed along the way

**A risk score that missed the week that mattered.** The first version raised a decision when a bill's score rose ten points in a week. The sidewalk bill cleared the subcommittee and faced the full committee three days later, and its score rose 4.8. The calendar component had been full the week before. Response levels replaced the score on screen.

**A response rule that needed movement.** The first categorical rule required a stage change in the week. Moru Foods' meat terms bill, which the client opposes and which a subcommittee takes up in two days, sat at Engage because nothing had moved since it was placed on the agenda. The rule now treats an opposed, high-impact bill with a meeting within seven days as Act now ([ADR-0009](docs/decisions/ADR-0009-categorical-response-levels.md)).

**A shared triage queue.** The first version marked an item as filed on the shared `Signal` itself. Whichever client's assistant ran first emptied the queue for the others, so the same week showed 48, 26 and 16 new items depending on the client. Filing now lives in each client's layer.

**Templated decisions.** The assistant's first decisions all read "Request a meeting with the chair's office". They ignored who had already been met and who actually held the vote, and they duplicated steps already in the plan. Selecting the target from the agenda-setters and the client's own assessments fixed both.

**A report that duplicated a tracker.** The first weekly report was a bill table with risk scores and a "Who matters" list cited to ontology ids. It repeated the tracker instead of the brief, and I expect an executive who has read This week to skip a table like that. The report now renders the same brief and cites source documents.

**Synthetic data that did not match the law.** An early version of the world had robots seeking sidewalk access that Korean law already granted in 2023, insurance bills in the wrong committee, a committee alternative existing before the committee adopted it, and committee chairs in their first term. A reader who knows the Assembly would stop trusting the demo at the first of these, so the generator now follows jurisdiction, seniority and procedure.

### Features I dropped

- **A role switch on screen.** Showing consultant and principal views side by side would explain the model to engineers but ask a client executive to learn roles they do not need. The viewer is the engagement lead; the roles stay in the ontology and the activity log.
- **A quadrant chart of stakeholders, movement arrows and target-stance outlines.** They look analytical and invite readers to treat a judgment as a measurement. The network keeps size, color and line style only.
- **A bill table on the landing page.** It moved to Issues & bills.
- **Model-written triage.** Rules plus a person cover the volume in the sample world, and a model adds a data path that needs its own controls.

## 7. Risks and limits

- **Fictional week, real snapshot beside it.** The clients, people, bills and the assistant's week run on generated data. Real public records (bills, minutes, notices, the Official Gazette, press releases and news headlines) are collected for each client's profile and shown from a committed snapshot, but kept apart from the fictional store: the assistant does not yet triage them, so the run shows structure and control flow rather than behavior on noisy real sources.
- **Ontology maintenance cost.** The issue list, keywords and stakeholder assessments need an owner. If nobody owns them, linking quality and stance accuracy decay.
- **Hand-set rules.** The response-level rules, the decision rule and the risk-score weights are explicit and tested, but they are my judgment written down, not fitted to outcomes.
- **Rules are brittle at the edges.** Aliases, renamed committees and amended bill titles will cause misses. The confirmation queue and the undo are the safety net.
- **No real authentication.** The viewer is fixed as the engagement lead. A real deployment needs identity, and the caller-context filter must run on a server behind it.
- **Browser state.** State lives in memory with a localStorage copy. Multi-user concurrency and durable storage are not addressed.
- **No model in the shipped build.** The adapter and the provider gate exist and are tested, but model quality is not shown here.
- **Tacit knowledge is not captured.** The ontology records what happened, what we decided and why we read a person a certain way. It does not hold a consultant's feel for a particular office.

## 8. What is next

1. Let the assistant triage the live public records behind the same Signal interface, and measure precision per client against the trial's relevance calls.
2. A server-side runtime with real identity, so the markings are enforced behind authentication instead of in a browser.
3. An evaluation set for triage: labeled items, measuring rule precision and where a model would help.
4. Staleness rules for stakeholder assessments: flag a stance whose newest basis record is old.
5. A review of the response-level and decision rules against a year of real bill histories.
6. Route the model choice for each drafting job through a task router, under the provider gate.
