# Korea Policy Ontology (Demo)

A government-relations workflow modelled as an ontology: bills, notices and news become the few decisions a client has to make each week, and a person approves every step.

**[Live demo](https://ai-odyssey.github.io/korea-policy-ontology/)** · runs in the browser, no sign-in

![Main flow: approve the week's decision, open the stakeholder it names, approve and send the weekly report](docs/img/main-flow.gif)

The demo opens on a Monday morning for one of three fictional clients. A rule-based assistant has already sorted the week's items, picked the one lawmaker worth meeting before this week's committee vote, and drafted the client report. You play the engagement lead: you approve or decline each step, and the activity log records who decided what.

No client or employer data or documents were used. The three clients, their people, bills and events are generated from a fixed seed. The legislative procedure and the institutions are real. Items marked "Public record" are real public items (bills, committee meetings, notices, the Official Gazette, press releases, news headlines) collected for each client's keywords.

## What to look at

- **This week**: one headline, the decisions the client has to take, risks and opportunities, what happens next, and what is waiting for your approval.
- **Stakeholders**: who decides at each stage of a bill, and what this client thinks of each of them. Open a person, then request a meeting.
- **Reports**: the weekly report built from the same data as This week. It cannot be sent until the lead approves it, and it goes back to review if the data changes afterwards.

## Why this matters for a deployment role

I started from how the work is actually done: reading a flow of items, deciding which ones matter to which client, and turning that into advice an executive can act on. The ontology models that workflow as objects (bills, issues, people, decisions, tasks), the links between them with their evidence, and actions that change state under rules.

Three things shaped the design. Every client-facing step waits for a named person, and the assistant can propose but not approve or send. Each client's confidential layer is kept apart in the data itself, not only on screen, so one client's work never shows in another's. And the screens show what a person has to decide, with reasons, instead of a score. [CASE_STUDY.md](CASE_STUDY.md) explains the choices and what I would measure in a real deployment.

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

대관 업무를 객체, 관계, 액션, 승인으로 나눈 온톨로지 데모입니다. 월요일 아침에 규칙 기반 비서가 한 주의 소식을 분류하고, 이번 주 위원회 전에 만날 의원 한 명을 골라 결정 안건으로 올리고, 고객사 보고서 초안을 씁니다. 업무 책임자가 승인하기 전에는 아무것도 고객에게 나가지 않습니다. 고객사, 인물, 법안은 모두 가상이고 고객사나 회사의 실제 자료는 쓰지 않았습니다. "Public record" 표시가 붙은 항목만 실제 공개 기록입니다.

## License

All rights reserved. See [LICENSE](LICENSE).
