# Korea Policy Ontology (Demo)

A tool for a company's in-house government-affairs (대관) team, modelled as an ontology. The assistant sorts the week's bills, notices and news, drafts and proposes. The head of government affairs reviews every step. Company leadership gets the few decisions it has to take and the weekly report.

**[Live demo](https://ai-odyssey.github.io/korea-policy-ontology/)** · runs in the browser, no sign-in

![Main flow: approve the week's decision, open the stakeholder it names, approve and send the weekly report](docs/img/main-flow.gif)

The demo opens on a Monday morning at one of three fictional companies, each an example deployment of the same system. A rule-based assistant has already sorted the week's items, picked the one lawmaker worth meeting before this week's committee vote, and drafted the weekly report for leadership. You are the head of government affairs: you review what the assistant and an analyst prepared, and the activity log records who decided what.

No company or employer data or documents were used. The three companies, their people, bills and events are generated from a fixed seed. The legislative procedure and the institutions are real. Items marked "Public record" are real public items (bills, committee meetings, notices, the Official Gazette, press releases, news headlines) collected for each company's keywords.

## What to look at

- **This week**: one headline, the decisions for leadership, risks and opportunities, what happens next, what is needed from other teams, and what is waiting for your review.
- **Stakeholders**: who decides at each stage of a bill, and what the company thinks of each of them. Open a person, then request a meeting.
- **Reports**: the weekly report to leadership, built from the same data as This week. It cannot be sent until the head of government affairs approves it, and it goes back to review if the data changes afterwards.
- **AI work log**: the steps the assistant took this week and where it stopped for a person.

## Why this matters for a deployment role

I designed this system as the person who would build and deploy it for an in-house team. I started from how the team's work is actually done: reading a flow of items, deciding which ones matter to the company, and turning that into advice leadership can act on.

The design work was four things. I modelled the team's workflow as objects (bills, issues, people, decisions, tasks), the links between them with their evidence, and actions that change state under rules. I set the approval gates: the assistant can propose but not approve or send, and every step that reaches leadership waits for a named person. I separated the confidential layers in the data itself, not only on screen, so one deployment's work never shows in another's. And I made the screens show what a person has to decide, with reasons, instead of a score. [CASE_STUDY.md](CASE_STUDY.md) explains the choices and what I would measure in a deployment: time from an item's arrival to a triage decision, events found too late, analyst time per weekly report, and any access across company layers. There are no results from a real deployment here.

## Run it

```bash
npm install          # Node 24 runs the .ts scripts directly
npm run dev          # demo at http://localhost:5173
npm test             # vitest
npm run build        # static bundle in dist/
npm run preview      # serves the build at http://localhost:4173
```

The demo needs no server and no API key. `npm run seed` regenerates the world, `npm run validate` checks it against the schema, `npm run typecheck` runs `tsc`. Collecting public records from the command line is described in [docs/reference.md](docs/reference.md#live-data). The connectors for the government sites beyond the Assembly and news are not published, so the snapshot in the demo can be read but not rebuilt from this repository.

## Read more

- [CASE_STUDY.md](CASE_STUDY.md): the problem, the design choices and what failed along the way
- [docs/walkthrough.md](docs/walkthrough.md): one concrete week from Monday to the report
- [docs/ontology.md](docs/ontology.md): objects, links, actions and permissions, generated from the schema
- [docs/security-model.md](docs/security-model.md): markings, approvals, the model-provider gate and the tests behind them
- [docs/decisions/](docs/decisions): ten short decision records
- [docs/reference.md](docs/reference.md): screen-to-ontology mapping, live data, architecture, the fictional world, tests, repository layout

## 한국어 요약

기업의 사내 대관팀이 직접 쓰는 도구를 객체, 관계, 액션, 승인으로 나눈 온톨로지 데모입니다. 월요일 아침에 규칙 기반 비서가 한 주의 소식을 분류하고, 이번 주 위원회 전에 만날 의원 한 명을 골라 경영진이 판단할 안건으로 올리고, 경영진에게 보낼 주간 보고서 초안을 씁니다. 대관 책임자가 승인하기 전에는 아무것도 경영진에게 나가지 않습니다. 저는 이 도구를 쓰는 사람이 아니라, 사내 대관팀을 위해 설계하고 배치하는 담당자의 관점에서 만들었습니다. 회사, 인물, 법안은 모두 가상이고 실제 회사나 고용주의 자료는 쓰지 않았습니다. "Public record" 표시가 붙은 항목만 실제 공개 기록입니다.

## License

All rights reserved. See [LICENSE](LICENSE).
