# Korea Policy Ontology (Demo)

An operational tool for a company's in-house government-affairs (대관) team, built on an ontology. Every Monday it turns a flow of bills, committee notices and news into the few decisions leadership has to take, with the reasons traced back to source records, and nothing reaches leadership until a named person approves it.

**[Live demo](https://ai-odyssey.github.io/korea-policy-ontology/)** · runs in the browser, no sign-in

![Main flow: read the week's judgment and how it was worked out, approve the decision, open the lawmaker it names, approve the weekly report and send it](docs/img/main-flow.gif)

## Two minutes in the demo

1. **This week.** Read the headline, then open "How this was worked out": the meeting and the notice it comes from, the bill's stage and where it was read, the response-level rules, the company position, the impact rating, and the records the decision rests on. Each one opens.
2. **Decide.** Approve the decision for leadership, then open the lawmaker it names on **Stakeholders** and request the meeting.
3. **Report and audit.** Approve the weekly report on **Reports** and send it. The **Audit log** shows every step: who did it, what changed, who approved it.

## What it shows

- **A workflow turned into a model.** Bills, issues, lawmakers, meetings, the company's positions, impact ratings, decisions and tasks are objects; sponsorships, seats and agenda items are links with a source record behind them; every change is a typed action. [docs/ontology.md](docs/ontology.md) is generated from the schema.
- **Governance in the data, not only on screen.** Actions check who may run them and which need approval. The rule-based assistant can propose but never approve or send. Each company's records carry its marking, so one deployment never sees another's, and only the collector writes to the shared public layer.
- **Judgments that explain themselves.** Response levels are rules, not a score. A decision links to the meeting, the assessment, the position and the impact rating it rests on, and shows as out of date when any of them changes.
- **A plan to deploy it.** [CASE_STUDY.md](CASE_STUDY.md) covers how I would start with one team and one weekly report, what a pilot would measure, what failed while building it, and what an outside review made me change.

## Scope, plainly

This is a self-directed proof of concept. I built it to test how my government-affairs experience translates into designing an operational system; it has not been deployed and has no users or results. The three companies (Aster Robotics, Moru Foods, Wrenfield Pay), their people, bills and events are fictional and generated from a fixed seed; the legislative procedure and institutions are real, and items marked "Public record" are real public records collected for each company's keywords. No company or employer data was used.

## Run it

```bash
npm install          # Node 24 runs the .ts scripts directly
npm run dev          # demo at http://localhost:5173
npm test             # vitest
```

`npm run build` makes the static bundle, `npm run seed` regenerates the world and `npm run validate` checks it against the schema. Collecting public records is described in [docs/reference.md](docs/reference.md#live-data); the connectors for government sites beyond the Assembly and news are not published.

## Read more

- [CASE_STUDY.md](CASE_STUDY.md): the problem, the design choices, the deployment plan and what failed
- [docs/walkthrough.md](docs/walkthrough.md): one week from Monday to the report
- [docs/security-model.md](docs/security-model.md): markings, approvals, the model-provider gate and their tests
- [docs/decisions/](docs/decisions): short decision records
- [docs/reference.md](docs/reference.md): screen-to-ontology mapping, live data, architecture, tests

## 한국어 요약

기업 사내 대관팀이 쓰는 운영 도구를 온톨로지(객체, 관계, 액션, 판단 규칙)로 설계한 데모입니다. 월요일마다 법안, 위원회 공지, 기사를 경영진이 내려야 할 몇 가지 결정으로 정리하고, 판단 근거를 원자료까지 거슬러 보여 줍니다. 대관 책임자가 승인하기 전에는 아무것도 경영진에게 나가지 않습니다. 실제 배치나 시범 운영 실적이 없는 개인 시험 제작물이며, 대관 실무 경험을 운영 시스템 설계로 옮겨 볼 수 있는지 시험하려고 만들었습니다. 회사, 인물, 법안은 모두 가상이고 "Public record" 표시가 붙은 항목만 실제 공개 기록입니다.

## License

All rights reserved. See [LICENSE](LICENSE).
