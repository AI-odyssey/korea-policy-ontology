// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Deterministic generator for the synthetic world. `npm run seed` rewrites data/world.json.
// Everything here is invented: clients, people, bills, events, signals. Institutions, their jurisdiction and the
// legislative process follow the real public procedure: referral to a standing committee, agenda placement, the bill
// review subcommittee (chaired by the majority-party secretary), the full committee vote, Legislation and Judiciary
// Committee review, the plenary. Government bills go through a 40-day legislative notice (the last easy moment to comment;
// the ministry must consider comments but is not bound), then regulatory review, the Ministry of Government Legislation, the
// Cabinet and presidential approval, which takes months before the bill is submitted and numbered. A committee alternative exists only once the full committee adopts it. The outdoor-robot bills amend the
// rules in force since November 2023 (certified robots of up to 500 kg and 15 km/h count as pedestrians; operators must
// be insured). Names are invented and were checked against the 22nd National Assembly member list.
import type { LinkRecord, ObjectRecord, World } from '../ontology/runtime.ts';
import { objectTypes, STAGE_ORDER } from '../ontology/schema.ts';
import type { Marking } from '../ontology/schema.ts';
import { clientMarking } from '../ontology/markings.ts';
import { addDays, monthDay, workdayOnOrAfter } from '../ontology/dates.ts';
import { cmp, pilotCatch } from '../ontology/functions.ts';

export const BASE_DATE = '2026-11-16';
export const SEED = 20261116;
const WEEK_START = '2026-11-09'; // the previous weekly report; "this week" is everything after it

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pad = (n: number, w = 3) => String(n).padStart(w, '0');
const iso = (date: string, h: number, m: number) => `${date}T${pad(h, 2)}:${pad(m, 2)}:00Z`;
const weekdayOnly = (d: string) => {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  return dow === 6 ? addDays(d, -1) : dow === 0 ? addDays(d, -2) : d;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Static content ----
const ISSUES = [
  ['iss-01', 'Sidewalk rules for outdoor mobile robots', 'Changes to the 2023 rules that let certified outdoor mobile robots use sidewalks: a cargo class, pedestrian priority duties and police enforcement.', ['sidewalk', 'outdoor mobile robot', 'pedestrian', 'pedestrian priority', 'road traffic act', 'cargo class']],
  ['iss-02', 'Operation safety certification', 'How outdoor robots are certified before they may use sidewalks: test bodies, renewal and recognition of foreign test results.', ['safety certification', 'operation safety', 'test body', 'certification renewal']],
  ['iss-03', 'Insurance for robot operators', 'The scope and minimum coverage of the insurance every operator of a certified robot must carry.', ['liability insurance', 'mandatory insurance', 'operator liability', 'insurance coverage']],
  ['iss-04', 'Local pilot zones for robots', 'Zones where cities may test robots under relaxed width and speed limits before national rules change.', ['pilot zone', 'regulation-free zone', 'local pilot', 'special zone']],
  ['iss-05', 'Novel food ingredient approval', 'The procedure and review period for recognizing new food raw materials such as cultivated protein.', ['novel food', 'ingredient approval', 'cell-cultured', 'cultivated protein', 'temporary standard']],
  ['iss-06', 'Labeling and the term "meat"', 'Which terms products may use on labels when the protein is not conventionally raised livestock.', ['labeling standard', 'meat naming', 'meat terms', 'cell-based', 'alternative protein', 'label wording']],
  ['iss-07', 'Food-tech regulatory sandbox', 'Temporary sales permits for food technology products while their review is pending.', ['regulatory sandbox', 'food-tech', 'temporary permit']],
  ['iss-08', 'Electronic financial business registration', 'Registration, capital and local presence requirements for foreign payment providers.', ['electronic financial', 'registration requirement', 'capital requirement', 'foreign provider', 'local presence']],
  ['iss-09', 'Prepaid balance protection', 'How prepaid balances and customer funds must be safeguarded and segregated.', ['prepaid', 'customer funds', 'safeguarding', 'segregation']],
  ['iss-10', 'Cross-border remittance limits', 'Annual and per-transaction limits and reporting thresholds for small remittance providers.', ['remittance', 'cross-border payment', 'transfer limit', 'foreign exchange']],
  ['iss-11', 'Cross-border data transfer', 'Conditions for sending personal information abroad.', ['data transfer', 'overseas transfer', 'data localization', 'personal information']],
] as const;

const ISSUE_META: Record<string, { committee: string; ministries: string[]; orgs: string[]; topics: string[] }> = {
  'iss-01': { committee: 'pasc', ministries: ['inst-npa'], orgs: ['org-01', 'org-02', 'org-03', 'org-04', 'org-13'],
    topics: ['a pedestrian priority rule for outdoor mobile robots', 'sidewalk access for cargo-class delivery robots', 'robot operator duties under the Road Traffic Act', 'the review of the 2023 sidewalk rules for outdoor mobile robots'] },
  'iss-02': { committee: 'tiec', ministries: ['inst-motir'], orgs: ['org-01', 'org-05'],
    topics: ['operation safety certification for outdoor robots', 'recognizing foreign test results for robot safety certification', 'the renewal period for robot safety certification'] },
  'iss-03': { committee: 'tiec', ministries: ['inst-motir'], orgs: ['org-01', 'org-05', 'org-04'],
    topics: ['minimum insurance coverage for robot operators', 'operator liability and insurance coverage after robot accidents'] },
  'iss-04': { committee: 'tiec', ministries: ['inst-mss', 'inst-motir'], orgs: ['org-01', 'org-13'],
    topics: ['robot pilot zones in regulation-free zones', 'city applications for a robot pilot zone', 'extending the pilot zone program to more cities'] },
  'iss-05': { committee: 'hwc', ministries: ['inst-mfds'], orgs: ['org-06', 'org-09', 'org-07'],
    topics: ['the novel food ingredient approval process for cultivated protein', 'a temporary standard for cell-cultured ingredients under review', 'novel food applications waiting for ingredient approval'] },
  'iss-06': { committee: 'hwc', ministries: ['inst-mfds'], orgs: ['org-06', 'org-07', 'org-08'],
    topics: ['a labeling standard for cell-based foods', 'restrictions on meat terms for alternative protein products', 'label wording for cell-based and alternative protein products'] },
  'iss-07': { committee: 'hwc', ministries: ['inst-mfds'], orgs: ['org-06', 'org-09'],
    topics: ['a regulatory sandbox for food-tech firms', 'temporary permit conditions for food-tech products'] },
  'iss-08': { committee: 'pac', ministries: ['inst-fsc', 'inst-fss'], orgs: ['org-10', 'org-11'],
    topics: ['registration requirements for electronic financial business operators', 'the capital requirement for a foreign provider seeking electronic financial registration', 'a local presence requirement for foreign providers'] },
  'iss-09': { committee: 'pac', ministries: ['inst-fsc', 'inst-fss'], orgs: ['org-10', 'org-11', 'org-12'],
    topics: ['safeguarding of prepaid balances and customer funds', 'segregation of customer funds held for prepaid payment'] },
  'iss-10': { committee: 'fepc', ministries: ['inst-mofe'], orgs: ['org-10', 'org-12', 'org-11'],
    topics: ['cross-border payment and remittance limits', 'raising the annual transfer limit for small remittance providers', 'reporting thresholds for small remittance and cross-border payment transactions'] },
  'iss-11': { committee: 'pac', ministries: ['inst-pipc'], orgs: ['org-10', 'org-11'],
    topics: ['conditions for overseas transfer of personal information', 'cross-border data transfer rules and data localization demands'] },
};

const PROVISIONS: [string, string, string, string, string][] = [
  ['prov-01', 'Road Traffic Act', 'Art. 2', 'Definitions: pedestrian and outdoor mobile robot', 'Since November 2023 a robot certified under the Intelligent Robots Act counts as a pedestrian and may use sidewalks and crossings.'],
  ['prov-02', 'Road Traffic Act', 'Art. 8-2', 'Duties of outdoor mobile robot operators', 'Operators must control the robot correctly and must not run it in a way that endangers or obstructs others.'],
  ['prov-03', 'Intelligent Robots Act', 'Art. 40-2', 'Operation safety certification', 'Certification before a robot may use sidewalks. Current rules cover robots up to 500 kg, 15 km/h and 800 mm wide.'],
  ['prov-04', 'Intelligent Robots Act', 'Art. 40-4', 'Mandatory insurance for operators', 'Operators of certified robots must carry insurance or mutual aid cover for injury and property damage.'],
  ['prov-05', 'Intelligent Robots Act', 'New article', 'Local pilot zones for outdoor mobile robots', 'Article the pending bills would insert, letting cities designate robot pilot zones.'],
  ['prov-06', 'Road Traffic Act', 'Art. 27', 'Protection of pedestrians', 'Duties of drivers toward pedestrians, such as stopping before a crosswalk. Robots certified since November 2023 count as pedestrians.'],
  ['prov-12', 'Road Traffic Act', 'Art. 17', 'Speed limits', 'The basis for maximum speeds on roads. The pending bill would add a limit for robots on paths shared with pedestrians.'],
  ['prov-07', 'Food Sanitation Act', 'Art. 7', 'Standards and specifications for foods', 'Standards that decide which raw materials may be used.'],
  ['prov-08', 'Food Sanitation Act', 'Art. 7-3', 'Recognition of temporary standards', 'Recognition procedure for raw materials not yet covered by a standard.'],
  ['prov-09', 'Food Labeling and Advertising Act', 'Art. 4', 'Labeling standards', 'Mandatory label items and wording.'],
  ['prov-10', 'Food Labeling and Advertising Act', 'Art. 8', 'Prohibited labeling', 'Labels that mislead about the nature of a food.'],
  ['prov-11', 'Food Sanitation Act', 'New article', 'Temporary sales permits for food-tech products', 'Article the pending bills would insert for limited sales while review is pending.'],
  ['prov-13', 'Electronic Financial Transactions Act', 'Art. 28', 'Registration of electronic financial business', 'Who may operate and what registration requires.'],
  ['prov-14', 'Electronic Financial Transactions Act', 'Art. 31', 'Capital requirements', 'Minimum capital for registered operators.'],
  ['prov-15', 'Electronic Financial Transactions Act', 'Art. 23', 'Prepaid electronic payment means', 'Issuance and use of prepaid balances.'],
  ['prov-16', 'Electronic Financial Transactions Act', 'Art. 24', 'Safeguarding of prepaid balances', 'Duty to protect customer funds.'],
  ['prov-17', 'Foreign Exchange Transactions Act', 'Art. 3', 'Definitions of foreign exchange transactions', 'Scope of regulated cross-border payments.'],
  ['prov-18', 'Foreign Exchange Transactions Act', 'Art. 16', 'Reporting of cross-border payments', 'Reporting thresholds for outbound transfers.'],
  ['prov-19', 'Personal Information Protection Act', 'Art. 28-8', 'Overseas transfer of personal information', 'Conditions for sending personal information abroad.'],
  ['prov-20', 'Personal Information Protection Act', 'Art. 28-9', 'Suspension of overseas transfer', 'When the regulator may order a transfer stopped.'],
  // Articles that pending or passed texts insert, so that no two texts at different stages amend the same article.
  ['prov-21', 'Electronic Financial Transactions Act', 'New article', 'Oversight of outsourced operations', 'Article the committee alternative would insert to put outsourced operations under supervision.'],
  ['prov-22', 'Intelligent Robots Act', 'New article', 'Minimum coverage by robot weight class', 'Article the weight-class bill would insert to set minimum insurance coverage by weight class. The committee alternative leaves coverage amounts out.'],
  ['prov-23', 'Food Labeling and Advertising Act', 'New article', 'Country-of-origin line for processed foods', 'Article inserted by the origin labeling bill, which passed in October, on stating the country of origin of raw materials.'],
];
const PROV_BY_ISSUE: Record<string, string[]> = {
  'iss-01': ['prov-01', 'prov-02'], 'iss-02': ['prov-03'], 'iss-03': ['prov-04'], 'iss-04': ['prov-05'], 'iss-05': ['prov-07', 'prov-08'],
  'iss-06': ['prov-09', 'prov-10'], 'iss-07': ['prov-11'], 'iss-08': ['prov-13', 'prov-14'], 'iss-09': ['prov-15', 'prov-16'],
  'iss-10': ['prov-17', 'prov-18'], 'iss-11': ['prov-19', 'prov-20'],
};
const REGULATES: Record<string, string[]> = {
  'inst-npa': ['prov-01', 'prov-02', 'prov-06', 'prov-12'], 'inst-motir': ['prov-03', 'prov-04', 'prov-05', 'prov-22'], 'inst-mss': ['prov-05'],
  'inst-mfds': ['prov-07', 'prov-08', 'prov-09', 'prov-10', 'prov-11', 'prov-23'], 'inst-fsc': ['prov-13', 'prov-14', 'prov-15', 'prov-21'],
  'inst-fss': ['prov-15', 'prov-16'], 'inst-mofe': ['prov-17', 'prov-18'], 'inst-pipc': ['prov-19', 'prov-20'],
};

// [id, name, Korean name, kind, parent]
const INSTITUTIONS: [string, string, string, string, string?][] = [
  ['inst-plenary', 'National Assembly Plenary Session', '국회 본회의', 'plenary'],
  ['inst-pasc', 'Public Administration and Security Committee', '행정안전위원회', 'committee'],
  ['inst-pasc-brs', 'Bill Review Subcommittee, Public Administration and Security Committee', '행정안전위원회 법안심사소위원회', 'subcommittee', 'inst-pasc'],
  ['inst-hwc', 'Health and Welfare Committee', '보건복지위원회', 'committee'],
  ['inst-hwc-brs', 'Bill Review Subcommittee, Health and Welfare Committee', '보건복지위원회 법안심사소위원회', 'subcommittee', 'inst-hwc'],
  ['inst-pac', 'Political Affairs Committee', '정무위원회', 'committee'],
  ['inst-pac-brs', 'Bill Review Subcommittee, Political Affairs Committee', '정무위원회 법안심사소위원회', 'subcommittee', 'inst-pac'],
  ['inst-tiec', 'Trade, Industry, Energy, SMEs and Startups Committee', '산업통상자원중소벤처기업위원회', 'committee'],
  ['inst-tiec-brs', 'Bill Review Subcommittee, Trade, Industry, Energy, SMEs and Startups Committee', '산업통상자원중소벤처기업위원회 법안심사소위원회', 'subcommittee', 'inst-tiec'],
  ['inst-fepc', 'Finance, Economy and Planning Committee', '재정경제기획위원회', 'committee'],
  ['inst-fepc-brs', 'Economy and Finance Subcommittee, Finance, Economy and Planning Committee', '재정경제기획위원회 경제재정소위원회', 'subcommittee', 'inst-fepc'],
  ['inst-ljc', 'Legislation and Judiciary Committee', '법제사법위원회', 'committee'],
  ['inst-npa', 'Korean National Police Agency', '경찰청', 'agency'],
  ['inst-motir', 'Ministry of Trade, Industry and Resources', '산업통상부', 'ministry'],
  ['inst-mss', 'Ministry of SMEs and Startups', '중소벤처기업부', 'ministry'],
  ['inst-mfds', 'Ministry of Food and Drug Safety', '식품의약품안전처', 'agency'],
  ['inst-fsc', 'Financial Services Commission', '금융위원회', 'agency'],
  ['inst-fss', 'Financial Supervisory Service', '금융감독원', 'agency'],
  ['inst-mofe', 'Ministry of Finance and Economy', '재정경제부', 'ministry'],
  ['inst-pipc', 'Personal Information Protection Commission', '개인정보보호위원회', 'agency'],
  // The other standing committees of the 22nd National Assembly. No bill in this world is referred to them; a client may still watch them.
  ['inst-hsc', 'House Steering Committee', '국회운영위원회', 'committee'],
  ['inst-edc', 'Education Committee', '교육위원회', 'committee'],
  ['inst-stic', 'Science, ICT, Broadcasting and Communications Committee', '과학기술정보방송통신위원회', 'committee'],
  ['inst-fauc', 'Foreign Affairs and Unification Committee', '외교통일위원회', 'committee'],
  ['inst-ndc', 'National Defense Committee', '국방위원회', 'committee'],
  ['inst-cstc', 'Culture, Sports and Tourism Committee', '문화체육관광위원회', 'committee'],
  ['inst-afc', 'Agriculture, Food, Rural Affairs, Oceans and Fisheries Committee', '농림축산식품해양수산위원회', 'committee'],
  ['inst-celc', 'Climate, Energy, Environment and Labor Committee', '기후에너지환경노동위원회', 'committee'],
  ['inst-litc', 'Land, Infrastructure and Transport Committee', '국토교통위원회', 'committee'],
  ['inst-intc', 'Intelligence Committee', '정보위원회', 'committee'],
  ['inst-gefc', 'Gender Equality and Family Committee', '성평등가족위원회', 'committee'],
];
// Short names for meeting titles.
const SHORT: Record<string, string> = {
  pasc: 'Public Administration and Security', hwc: 'Health and Welfare', pac: 'Political Affairs', tiec: 'Trade, Industry, Energy, SMEs and Startups',
  fepc: 'Finance, Economy and Planning', ljc: 'Legislation and Judiciary',
};

const ORGS: [string, string][] = [
  ['Metro Robotics Industry Forum', 'association'], ['Pedestrian Rights Network', 'ngo'], ['Seniors Mobility Alliance', 'ngo'],
  ['National Delivery Workers Union', 'union'], ['Gyeolmaru Civic Safety Institute', 'research'], ['Cultivated Protein Council', 'association'],
  ['Traditional Livestock Producers Federation', 'association'], ['Consumer Labeling Watch', 'ngo'], ['Food Science Research Hub', 'research'],
  ['Fintech Payments Association', 'association'], ['Consumer Finance Network', 'ngo'], ['Small Merchants Federation', 'association'], ['Corrimo Last Mile', 'company'],
];

// 28 lawmakers sit on the four committees the clients care most about (seven seats each), then four on the Legislation
// and Judiciary Committee and four on the Finance, Economy and Planning Committee. Each lawmaker sits on one committee.
const LAWMAKERS = ['Seo Haeun', 'Baek Siwoo', 'Nam Eunbi', 'Ryu Taehwan', 'Jang Sora', 'Ahn Minjae', 'Kwon Dasom', 'Hwang Seungho', 'Oh Yeeun', 'Bae Kyungsoo',
  'Shin Hyewon', 'Yoo Gunwoo', 'Lim Bora', 'Jeon Hanbin', 'Go Mirae', 'Noh Dongha', 'Cha Seulgi', 'Hong Jiwan', 'Min Soobin', 'Gil Seonwoo', 'Seok Danbi',
  'Choi Haneul', 'Kang Hyeonu', 'Jung Areum', 'Yang Sungmin', 'Son Jaeyoon', 'Ha Seoyeon', 'Yun Gaon'];
const LJC_MEMBERS = ['Joo Hayul', 'Woo Dahyun', 'Na Yerin', 'Eun Jaehyuk'];
const FEPC_MEMBERS = ['Mo Sungjae', 'Bong Harin', 'Cheon Yuna', 'Hyun Seojun'];
const COMMITTEES = ['pasc', 'hwc', 'pac', 'tiec'];
const CHAIR_PARTY: Record<string, string> = { pasc: 'Party A', hwc: 'Party B', pac: 'Party A', tiec: 'Party B', ljc: 'Party A', fepc: 'Party B' };
const OFFICIALS: [string, string, string][] = [
  ['Cho Wonil', 'Director, Foreign Exchange System Division', 'inst-mofe'], ['Yeo Sujin', 'Director, Traffic Safety Division', 'inst-npa'],
  ['Bang Cheolmin', 'Director, Novel Food Evaluation Division', 'inst-mfds'], ['Tak Haerin', 'Director, Financial Innovation Division', 'inst-fsc'],
  ['Pyo Jinwoo', 'Head, Electronic Finance Department', 'inst-fss'], ['Gu Taeyoon', 'Director, Data Policy Division', 'inst-pipc'],
  ['Sung Dohyun', 'Director, Robotics Industry Division', 'inst-motir'], ['Eom Saebom', 'Director, Regulation-Free Zone Division', 'inst-mss'],
];
const STAFFERS = ['Jin Seoha', 'Ma Yunho', 'Seol Gaeun', 'Ok Daegeon', 'Do Nayoung', 'Byun Seungwoo', 'Yong Jiyul', 'Gwak Dami'];
const STAFFER_BOSS = [0, 1, 8, 9, 14, 15, 21, 22]; // index into LAWMAKERS
const ORG_REPS: [string, string][] = [
  ['Pyeon Sangmin', 'Executive Director'], ['Heo Narim', 'Policy Director'], ['Ji Woojin', 'Chair'], ['Im Chaerin', 'Secretary General'],
  ['Gam Joonho', 'Research Fellow'], ['Sa Eunchae', 'Director of Government Affairs'], ['Wang Jihun', 'Vice President'], ['Yeom Sooah', 'Policy Officer'],
];

// ty: L lawmaker, G government, A committee alternative. lead fixes the sponsor where the story depends on it.
interface BillSpec {
  n: number; s: string; iss: string[]; t: string; ty: 'L' | 'G' | 'A'; st: string; c: string; last?: string; into?: number; noticeEnd?: string;
  sponsorMin?: string; lead?: string; cos?: string[]; sum?: string;
  prov?: string[]; // provisions it amends, when not the issue's default pair
  burn?: number; // extra random draws kept so earlier seeded content does not move when a bill's chain is shortened
  then?: [string, string]; // a later stage reached after the generated history: [stage, date]
}
const B: BillSpec[] = [
  { n: 1, s: 'Sidewalk robot duties bill', iss: ['iss-01'], t: 'Act Partially Amending the Road Traffic Act (Cargo-Class Robots and Operator Duties on Sidewalks)', ty: 'L', st: 'subcommittee_passed', c: 'pasc', last: '2026-11-12', lead: 'per-002', cos: ['per-001', 'per-004', 'per-006'],
    sum: 'Would amend Articles 2 and 8-2 of the Road Traffic Act to let certified cargo-class robots up to 1,000 mm wide use sidewalks at least 3 m wide. The subcommittee added a duty to stop for any pedestrian within 2 m.' },
  { n: 2, s: 'Pedestrian priority zones bill', iss: ['iss-01'], t: 'Act Partially Amending the Road Traffic Act (Pedestrian Priority Zones)', ty: 'L', st: 'committee_review', c: 'pasc', lead: 'per-003',
    prov: ['prov-06'], sum: 'Would amend Article 27 of the Road Traffic Act to let police designate sidewalk sections where robots must give way to pedestrians at all times.' },
  { n: 3, s: 'Shared path speed limits bill', iss: ['iss-01'], t: 'Act Partially Amending the Road Traffic Act (Speed Limits for Robots on Shared Paths)', ty: 'L', st: 'committee_referred', c: 'pasc', prov: ['prov-12'] },
  { n: 4, s: 'Government bill on sidewalk operation standards', iss: ['iss-01', 'iss-04'], t: 'Act Partially Amending the Road Traffic Act (Government Bill: Sidewalk Operation Standards for Outdoor Mobile Robots)', ty: 'G', st: 'public_comment', c: 'pasc', noticeEnd: '2026-12-07', sponsorMin: 'inst-npa',
    sum: 'Would amend Articles 2 and 8-2 of the Road Traffic Act to authorize an enforcement decree to set robot classes and sidewalk operation standards, and to give police powers to stop non-compliant robots. The classes and standards themselves would be written in the decree, not in the Act.' },
  { n: 5, s: 'Foreign test results bill', iss: ['iss-02'], t: 'Act Partially Amending the Intelligent Robots Act (Recognition of Foreign Test Results)', ty: 'L', st: 'subcommittee', c: 'tiec', last: '2026-11-10' },
  { n: 6, s: 'Certification renewal bill', iss: ['iss-02'], t: 'Act Partially Amending the Intelligent Robots Act (Renewal of Operation Safety Certification)', ty: 'L', st: 'committee_referred', c: 'tiec' },
  { n: 7, s: 'Government bill on the certification body', iss: ['iss-02'], t: 'Act Partially Amending the Intelligent Robots Act (Government Bill: Designated Certification Body)', ty: 'G', st: 'submitted', c: 'tiec', sponsorMin: 'inst-motir' },
  { n: 8, s: 'Coverage by weight class bill', iss: ['iss-03'], t: 'Act Partially Amending the Intelligent Robots Act (Minimum Insurance Coverage by Weight Class)', ty: 'L', st: 'subcommittee', c: 'tiec', prov: ['prov-22'] }, // Art. 40-4 is settled in alternative 31; this bill adds a separate article for coverage amounts
  { n: 9, s: 'Pilot operation insurance bill', iss: ['iss-03'], t: 'Act Partially Amending the Intelligent Robots Act (Insurance for Robots in Pilot Operation)', ty: 'L', st: 'merged_alternative', c: 'tiec', into: 31 },
  { n: 10, s: 'Platform joint liability bill', iss: ['iss-03'], t: 'Act Partially Amending the Intelligent Robots Act (Joint Liability of Delivery Platforms)', ty: 'L', st: 'merged_alternative', c: 'tiec', into: 31 },
  { n: 11, s: 'Robot pilot zones bill', iss: ['iss-04'], t: 'Act Partially Amending the Intelligent Robots Act (Local Pilot Zones for Outdoor Mobile Robots)', ty: 'L', st: 'committee_review', c: 'tiec' },
  { n: 12, s: 'Pilot zone designation bill', iss: ['iss-04'], t: 'Act Partially Amending the Intelligent Robots Act (Pilot Zone Designation by Local Governments)', ty: 'L', st: 'committee_referred', c: 'tiec' },
  { n: 13, s: 'Novel ingredient recognition bill', iss: ['iss-05'], t: 'Act Partially Amending the Food Sanitation Act (Recognition Procedure for Novel Food Ingredients)', ty: 'L', st: 'subcommittee_passed', c: 'hwc', last: '2026-11-12', lead: 'per-009' },
  { n: 14, s: 'Government bill on ingredient reevaluation', iss: ['iss-05'], t: 'Act Partially Amending the Food Sanitation Act (Government Bill: Post-Market Reevaluation of Novel Ingredients)', ty: 'G', st: 'subcommittee_passed', c: 'hwc', last: '2026-11-12', sponsorMin: 'inst-mfds', burn: 1 }, // reviewed together with 13, 15 and 16: one text leaves the subcommittee
  { n: 15, s: 'Cultured ingredient standards bill', iss: ['iss-05'], t: 'Act Partially Amending the Food Sanitation Act (Temporary Standards for Cultured Ingredients)', ty: 'L', st: 'subcommittee_passed', c: 'hwc', last: '2026-11-12' },
  { n: 16, s: 'Fast-track review bill', iss: ['iss-05'], t: 'Act Partially Amending the Food Sanitation Act (Fast-Track Review for Cell-Based Foods)', ty: 'L', st: 'subcommittee_passed', c: 'hwc', last: '2026-11-12' },
  { n: 17, s: 'Origin labeling bill', iss: ['iss-06'], t: 'Act Partially Amending the Food Labeling and Advertising Act (Origin Labeling Clarification)', ty: 'L', st: 'passed', c: 'hwc', last: '2026-10-22', prov: ['prov-23'] }, // passed: must not share Arts. 4 and 8 with the pending labeling bills
  { n: 18, s: 'Meat terms restriction bill', iss: ['iss-06'], t: 'Act Partially Amending the Food Labeling and Advertising Act (Restriction on Meat Terms for Non-Livestock Products)', ty: 'L', st: 'committee_review', c: 'hwc', lead: 'per-013' },
  { n: 19, s: 'Cell-based food labeling bill', iss: ['iss-06'], t: 'Act Partially Amending the Food Labeling and Advertising Act (Labeling Standard for Cell-Based Foods)', ty: 'L', st: 'subcommittee', c: 'hwc' },
  { n: 20, s: 'Warning statement bill', iss: ['iss-06'], t: 'Act Partially Amending the Food Labeling and Advertising Act (Mandatory Warning Statement)', ty: 'L', st: 'withdrawn', c: 'hwc' },
  { n: 21, s: 'Food-tech sandbox bill', iss: ['iss-07'], t: 'Act Partially Amending the Food Sanitation Act (Temporary Sales Permits for Food-Tech Products)', ty: 'L', st: 'committee_referred', c: 'hwc' },
  { n: 22, s: 'Government bill on sandbox permits', iss: ['iss-07'], t: 'Act Partially Amending the Food Sanitation Act (Government Bill: Sandbox Sales Permits)', ty: 'G', st: 'submitted', c: 'hwc', sponsorMin: 'inst-mfds' },
  { n: 23, s: 'Local presence bill', iss: ['iss-08'], t: 'Act Partially Amending the Electronic Financial Transactions Act (Local Presence Requirement for Foreign Providers)', ty: 'L', st: 'committee_referred', c: 'pac', lead: 'per-017', then: ['committee_review', '2026-11-12'] },
  { n: 24, s: 'Capital requirement bill', iss: ['iss-08'], t: 'Act Partially Amending the Electronic Financial Transactions Act (Capital Requirement Adjustment)', ty: 'L', st: 'subcommittee', c: 'pac' },
  { n: 25, s: 'Outsourcing oversight bill', iss: ['iss-08'], t: 'Act Partially Amending the Electronic Financial Transactions Act (Oversight of Outsourced Operations)', ty: 'L', st: 'merged_alternative', c: 'pac', into: 33, prov: ['prov-21'] },
  { n: 26, s: 'Government bill on prepaid safeguarding', iss: ['iss-09'], t: 'Act Partially Amending the Electronic Financial Transactions Act (Government Bill: Prepaid Balance Safeguarding)', ty: 'G', st: 'public_comment', c: 'pac', noticeEnd: '2026-11-27', sponsorMin: 'inst-fsc' },
  { n: 27, s: 'Prepaid fund segregation bill', iss: ['iss-09'], t: 'Act Partially Amending the Electronic Financial Transactions Act (Segregation of Prepaid Funds)', ty: 'L', st: 'merged_alternative', c: 'pac', into: 33 },
  { n: 28, s: 'Remittance limits bill', iss: ['iss-10'], t: 'Act Partially Amending the Foreign Exchange Transactions Act (Annual Limit for Small Remittance Providers)', ty: 'L', st: 'committee_review', c: 'fepc', prov: ['prov-17'] },
  { n: 29, s: 'Small remittance reporting bill', iss: ['iss-10'], t: 'Act Partially Amending the Foreign Exchange Transactions Act (Reporting Threshold for Small Remittances)', ty: 'L', st: 'committee_passed', c: 'fepc', last: '2026-11-05', prov: ['prov-18'] },
  { n: 30, s: 'Overseas data transfer bill', iss: ['iss-11'], t: 'Act Partially Amending the Personal Information Protection Act (Overseas Transfer Conditions)', ty: 'L', st: 'subcommittee', c: 'pac' },
  { n: 31, s: 'Robot insurance committee alternative', iss: ['iss-03'], t: 'Committee Alternative: Insurance for Outdoor Mobile Robot Operators (Intelligent Robots Act)', ty: 'A', st: 'lj_review', c: 'tiec' },
  { n: 32, s: 'Data transfer certification bill', iss: ['iss-11'], t: 'Act Partially Amending the Personal Information Protection Act (Certification as a Transfer Route)', ty: 'L', st: 'committee_referred', c: 'pac' },
  { n: 33, s: 'Electronic finance committee alternative', iss: ['iss-08', 'iss-09'], t: 'Committee Alternative: Electronic Financial Transactions Act (Outsourcing Oversight and Fund Segregation)', ty: 'A', st: 'lj_review', c: 'pac', prov: ['prov-21', 'prov-15', 'prov-16'],
    sum: 'Would add an article to the Electronic Financial Transactions Act to put outsourced operations under supervision and amend Articles 23 and 24 to require prepaid funds to be held separately. Replaces the outsourcing oversight and prepaid fund segregation bills. The local presence and capital requirement bills amend Articles 28 and 31, which it leaves alone.' },
];

const STAGE_LABEL: Record<string, string> = {
  public_comment: 'in legislative notice', submitted: 'submitted', committee_referred: 'referred to committee',
  committee_review: 'placed on the committee agenda', subcommittee: 'in the bill review subcommittee', subcommittee_passed: 'passed the bill review subcommittee',
  committee_passed: 'passed the full committee', lj_review: 'in Legislation and Judiciary Committee review', plenary_pending: 'awaiting a plenary vote',
  passed: 'passed the plenary session', merged_alternative: 'folded into the committee alternative and discarded', withdrawn: 'withdrawn',
};
// Where each stage happens. A committee alternative replaces its source bills when the full committee adopts it.
const STAGE_INST: Record<string, (c: string) => string | undefined> = {
  committee_referred: (c) => `inst-${c}`, committee_review: (c) => `inst-${c}`, committee_passed: (c) => `inst-${c}`, merged_alternative: (c) => `inst-${c}`,
  subcommittee: (c) => `inst-${c}-brs`, subcommittee_passed: (c) => `inst-${c}-brs`, lj_review: () => 'inst-ljc', plenary_pending: () => 'inst-plenary', passed: () => 'inst-plenary',
};

const OUTLETS = ['Capital Policy Times', 'Daily Statehouse', 'The Assembly Ledger', 'Metro Business Review'];
// Each template sentence names at most one person or organization, so a sentence quoted about someone is about them.
// [title, text]
const TEMPLATES: Record<string, [string, string][]> = {
  press_release: [
    ['{inst} reviews {topic}', '{inst} announced a review of {topic}. Stakeholders are asked to submit views before the next meeting.'],
    ['{person} calls for wider consultation on {topic}', '{person} ({party}) released a statement on {topic} and called for wider consultation before a vote.'],
    ['{inst} briefing on {topic}', '{inst} will hold a briefing on {topic} and has invited {org} to present its views.'],
  ],
  news: [
    ['{org} warns against rushing {topic}', '{outlet} reports that {org} warned against rushing {topic}. {person} said the committee would take the matter up soon.'],
    ['Lawmakers split on {topic}', '{outlet}: Lawmakers are split on {topic}. {person} ({party}) questioned the timing of a vote. {org} has raised concerns about the proposal.'],
    ['Analysis: the pace of work on {topic}', '{outlet} analysis: work on {topic} is moving faster than expected, according to people close to {inst}.'],
  ],
  minutes: [
    ['Minutes: {inst} discusses {topic}', 'Minutes of the {inst}: members discussed {topic}. {person} asked the ministry about timing and was told further review is needed.'],
    ['Minutes: {person} raises {topic}', 'Minutes of the {inst}: {person} ({party}) raised {topic}. {org} was named as a witness for a later session.'],
  ],
  public_notice: [
    ['Consultation notice on {topic}', 'Notice from the {inst}: consultation on {topic}. Written comments are accepted for the period stated in the notice.'],
    ['{inst} seeks opinions on {topic}', 'The {inst} seeks opinions on {topic}. Interested parties may submit opinions in writing.'],
  ],
};

const NOISE = [
  'Assembly cafeteria announces holiday opening hours', 'Weather advisory: first snowfall expected in the capital region', 'National library extends opening hours during budget season',
  'Culture ministry unveils winter sports program for schools', 'Stock market closes mixed as exports rise', 'City subway announces timetable change for the holiday weekend',
  'Lawmaker publishes essay collection on rural revitalization', 'National museum opens autumn exhibition on ceramics',
];
// One keyword in common with a tracked issue, but not about policy: low-confidence matches for the review queue.
const NEAR_MISS: [string, string, string][] = [
  ['City announces sidewalk repaving schedule for the Odeumgol district', 'The city public works office will repave sidewalk sections in the Odeumgol district over six weekends, and pedestrian detours will be signposted.', 'iss-01'],
  ['Study on pedestrian foot traffic in shopping districts', 'A university team counted pedestrian foot traffic on sidewalk sections in three shopping districts to advise on festival planning.', 'iss-01'],
  ['Bank branch closures prompt customer funds complaints', 'Consumers filed complaints after a regional bank closed branches, citing difficulty withdrawing customer funds in cash.', 'iss-09'],
];

// What the record says each speaker said, by speaker id and meeting date. Each sentence starts with the speaker's name.
const REMARKS: Record<string, string> = {
  'per-002|2026-10-21': 'Baek Siwoo described the cargo-class provisions of his bill and the 3 m sidewalk threshold.',
  'per-004|2026-10-21': 'Ryu Taehwan said robots should give way to pedestrians at walking pace rather than stop dead.',
  'per-022|2026-10-21': 'Choi Haneul asked whether recognizing foreign test results could shorten certification.',
  'org-01|2026-10-21': 'Metro Robotics Industry Forum shared route data from pilot operations in three districts.',
  'org-05|2026-10-21': 'Gyeolmaru Civic Safety Institute presented its draft test plan for operation safety certification.',
  'per-001|2026-10-27': 'Seo Haeun said the committee wanted a sidewalk rule that pedestrians and operators could both accept this session.',
  'per-003|2026-10-27': 'Nam Eunbi asked how police would enforce operator duties on sidewalks narrower than 3 m.',
  'org-01|2026-10-27': 'Metro Robotics Industry Forum proposed a duty to slow and give way in place of a full stop.',
  'org-02|2026-10-27': 'Pedestrian Rights Network asked that robots stop for any pedestrian nearby on every sidewalk.',
  'per-030|2026-10-27': 'Yeo Sujin described how police check operator duties today and asked for clear robot classes.',
  'per-031|2026-11-05': 'Bang Cheolmin said the agency was drafting a temporary standard for cell-cultured ingredients.',
  'org-06|2026-11-05': 'Cultivated Protein Council presented safety data from approvals in other markets.',
  'org-07|2026-11-05': 'Traditional Livestock Producers Federation asked that cultivated products be kept from using livestock names.',
  'org-09|2026-11-05': 'Food Science Research Hub described how supervised sales trials could build a safety record.',
  'org-06|2026-11-10': 'Cultivated Protein Council asked for a fixed review period for novel ingredients and offered its members\' safety data.',
  'org-09|2026-11-10': 'Food Science Research Hub proposed supervised sales trials while ingredient review is pending.',
  'per-009|2026-11-10': 'Oh Yeeun said she would seek a statutory review deadline when the full committee takes up her recognition procedure bill.',
  'per-031|2026-11-12': 'Bang Cheolmin told the committee the agency could finish a novel ingredient review within 270 days if the law set a deadline.',
};

// ---- Generator ----
export function generateWorld(): World {
  const rnd = mulberry32(SEED);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const chance = (p: number) => rnd() < p;
  const sample = <T,>(a: readonly T[], n: number): T[] => {
    const c = [...a];
    const out: T[] = [];
    while (out.length < n && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]);
    return out;
  };
  const conf = (lo = 0.82, hi = 0.97) => Math.round((lo + rnd() * (hi - lo)) * 100) / 100;

  const objects: ObjectRecord[] = [];
  const links: LinkRecord[] = [];
  const byId = new Map<string, ObjectRecord>();
  const add = (type: string, id: string, props: Record<string, unknown>, marking?: Marking): ObjectRecord => {
    const layer = (objectTypes as Record<string, { layer: string }>)[type].layer;
    const m: Marking = marking ?? (layer === 'client' ? clientMarking(type === 'Client' ? id : (props.clientId as string)) : 'PUBLIC');
    const o: ObjectRecord = { id, type, markings: [m], synthetic: true, ...props };
    objects.push(o);
    byId.set(id, o);
    return o;
  };
  const label = (id: string) => byId.get(id)?.name ?? byId.get(id)?.shortTitle ?? byId.get(id)?.title ?? id;
  const said = (who: string, eventId: string) => { const r = REMARKS[`${who}|${byId.get(eventId)!.date}`]; return r ? ` ${r}` : ''; };
  const billRef = (id: string) => { const b = byId.get(id)!; return b.billNo ? `bill ${b.billNo}` : `the ${b.shortTitle}`; };
  const article = (p: string) => `${byId.get(p)!.article} of the ${byId.get(p)!.instrument}`;

  // What an official record says for each kind of public link.
  const officialExcerpt = (from: string, type: string, to: string, props?: Record<string, unknown>): string => {
    switch (type) {
      case 'regulates': return `${label(from)} administers ${article(to)}.`;
      case 'member_of': return `The ${label(to)} roster lists ${label(from)} as ${props?.role === 'official' ? 'an official' : props?.role}.`;
      case 'sponsors': return `The bill record lists ${label(from)} as the proposer of ${billRef(to)}.`;
      case 'cosponsors': return `The bill record lists ${label(from)} among the cosponsors of ${billRef(to)}.`;
      case 'referred_to': return `The bill record shows ${billRef(from)} referred to the ${label(to)}.`;
      case 'amends': return `The bill text amends ${article(to)}.`;
      case 'about': return `The title of ${billRef(from)} concerns ${String(byId.get(to)!.title).toLowerCase()}.`;
      default: return `${label(from)}: ${label(to)}.`;
    }
  };

  let evN = 0;
  let lnN = 0;
  interface Ev { signalId?: string; excerpt?: string; method?: 'rule' | 'llm' | 'human'; confidence?: number; sourceType?: string; sourceUrl?: string; review?: boolean }
  const evidence = (from: string, type: string, to: string, ev: Ev = {}, props?: Record<string, unknown>): string => {
    const id = `ev-${pad(++evN, 4)}`;
    const confidence = ev.confidence ?? conf(0.95, 0.99);
    const method = ev.method ?? 'rule';
    add('Evidence', id, {
      sourceUrl: ev.sourceUrl ?? `https://example.invalid/records/${from}`,
      sourceType: ev.sourceType ?? 'official_record',
      ...(ev.signalId ? { signalId: ev.signalId } : {}),
      excerpt: ev.excerpt ?? officialExcerpt(from, type, to, props),
      method, confidence, reviewStatus: ev.review ?? (method !== 'human' && confidence < 0.8) ? 'review' : 'accepted',
    });
    return id;
  };
  const link = (type: string, from: string, to: string, props?: Record<string, unknown>, ev?: Ev | false, marking?: Marking): void => {
    const l: LinkRecord = {
      id: `lnk-${pad(++lnN, 4)}`, type, from, to, ...(props ? { props } : {}), markings: [marking ?? 'PUBLIC'], evidence: [], synthetic: true,
    };
    if (ev !== false && !marking) l.evidence.push(evidence(from, type, to, ev, props));
    links.push(l);
  };

  // Issues, provisions, institutions, organizations
  for (const [id, title, summary, keywords] of ISSUES) add('Issue', id, { title, summary, keywords: [...keywords] });
  for (const [id, instrument, art, title, summary] of PROVISIONS) add('Provision', id, { instrument, article: art, title, summary });
  for (const [id, name, nameKo, kind, parentId] of INSTITUTIONS) add('Institution', id, { name, nameKo, kind, ...(parentId ? { parentId } : {}) });
  ORGS.forEach(([name, kind], i) => add('StakeholderOrg', `org-${pad(i + 1, 2)}`, { name, kind }));
  for (const [inst, provs] of Object.entries(REGULATES)) for (const p of provs) link('regulates', inst, p, undefined, ['prov-06', 'prov-12', 'prov-21', 'prov-22', 'prov-23'].includes(p) ? { confidence: 0.97 } : {}); // fixed confidence: no random draw

  // People. Within each committee: seat 0 chair (three or more terms), seat 3 majority secretary, seat 4 minority secretary.
  const seat = (i: number) => (i === 0 ? 'chair' : i === 3 || i === 4 ? 'secretary' : 'member');
  let seatN = 0;
  const lawmaker = (name: string, id: string, committee: string, i: number) => add('Person', id, {
    name, kind: 'lawmaker',
    party: i === 0 ? CHAIR_PARTY[committee] : i === 3 ? 'Party A' : i === 4 ? 'Party B' : ['Party A', 'Party B', 'Party C'][i % 3],
    district: i === 5 ? 'Proportional representation' : `Constituency ${pad(++seatN * 3 + 1, 2)}`,
    terms: i === 0 ? 3 + (committee.length % 2) : i === 3 || i === 4 ? 2 + (i % 2) : 1 + (i % 2),
  });
  const law = LAWMAKERS.map((name, i) => lawmaker(name, `per-${pad(i + 1)}`, COMMITTEES[Math.floor(i / 7)], i % 7));
  const officials = OFFICIALS.map(([name, title, org], i) => {
    const p = add('Person', `per-${pad(LAWMAKERS.length + i + 1)}`, { name, kind: 'official', title });
    link('member_of', p.id, org, { role: 'official', since: '2025-03-01' });
    return p;
  });
  const staffers = STAFFERS.map((name, i) => add('Person', `per-${pad(LAWMAKERS.length + OFFICIALS.length + i + 1)}`, {
    name, kind: 'staffer', title: 'Legislative aide', aideTo: law[STAFFER_BOSS[i]].id,
  }));
  ORG_REPS.forEach(([name, title], i) => add('Person', `per-${pad(LAWMAKERS.length + OFFICIALS.length + STAFFERS.length + i + 1)}`, {
    name, kind: 'org_rep', title, orgId: `org-${pad(i + 1, 2)}`,
  }));
  let nextPer = LAWMAKERS.length + OFFICIALS.length + STAFFERS.length + ORG_REPS.length;
  const ljc = LJC_MEMBERS.map((name, i) => lawmaker(name, `per-${pad(++nextPer)}`, 'ljc', [0, 3, 4, 1][i]));
  const fepc = FEPC_MEMBERS.map((name, i) => lawmaker(name, `per-${pad(++nextPer)}`, 'fepc', [0, 3, 4, 1][i]));

  // Committee membership (second half of the 22nd Assembly roles date from June 2026).
  const members: Record<string, ObjectRecord[]> = {};
  const since = (role: string) => (role === 'member' ? '2024-06-10' : '2026-06-15');
  COMMITTEES.forEach((c, k) => {
    const ms = law.slice(k * 7, k * 7 + 7);
    members[c] = ms;
    ms.forEach((p, i) => link('member_of', p.id, `inst-${c}`, { role: seat(i), since: since(seat(i)) }));
    // The bill review subcommittee is chaired by the majority secretary; the minority secretary sits on it.
    [3, 4, 1, 5].forEach((i) => link('member_of', ms[i].id, `inst-${c}-brs`, { role: i === 3 ? 'chair' : 'member', since: since(i === 3 ? 'chair' : 'member') }));
  });
  ljc.forEach((p, i) => link('member_of', p.id, 'inst-ljc', { role: seat([0, 3, 4, 1][i]), since: since(seat([0, 3, 4, 1][i])) }));
  members.fepc = fepc;
  fepc.forEach((p, i) => link('member_of', p.id, 'inst-fepc', { role: seat([0, 3, 4, 1][i]), since: since(seat([0, 3, 4, 1][i])) }));
  [1, 2, 3].forEach((i) => link('member_of', fepc[i].id, 'inst-fepc-brs', { role: i === 1 ? 'chair' : 'member', since: since(i === 1 ? 'chair' : 'member') }));
  staffers.forEach((s, i) => {
    const boss = law[STAFFER_BOSS[i]];
    const committee = COMMITTEES[Math.floor(STAFFER_BOSS[i] / 7)];
    link('member_of', s.id, `inst-${committee}`, { role: 'staff', since: '2025-01-06' }, { excerpt: `The staff roster lists ${s.name} as aide to ${boss.name}.` });
  });

  // ---- Bills ----
  interface HistEntry { stage: string; date: string; institutionId?: string }
  const hist = new Map<number, HistEntry[]>();
  const chainOf = (b: BillSpec): string[] => {
    // An alternative is born at the full committee vote; lawmaker bills start at submission.
    const full: string[] = b.ty === 'G' ? [...STAGE_ORDER] : b.ty === 'A' ? STAGE_ORDER.slice(STAGE_ORDER.indexOf('committee_passed')) : STAGE_ORDER.slice(1);
    if (b.st === 'merged_alternative') return [...full.slice(0, full.indexOf('subcommittee') + 1), 'merged_alternative'];
    if (b.st === 'withdrawn') return [...full.slice(0, full.indexOf('committee_referred') + 1), 'withdrawn'];
    return full.slice(0, full.indexOf(b.st) + 1);
  };
  const minister = (b: BillSpec) => b.sponsorMin!;
  const buildHist = (b: BillSpec): HistEntry[] => {
    const chain = chainOf(b);
    if (b.n === 1) {
      return [['submitted', '2026-09-24'], ['committee_referred', '2026-09-30'], ['committee_review', '2026-10-20'], ['subcommittee', '2026-10-29'], ['subcommittee_passed', '2026-11-12']]
        .map(([stage, date]) => ({ stage, date, ...(STAGE_INST[stage] ? { institutionId: STAGE_INST[stage](b.c) } : {}) }));
    }
    if (b.st === 'public_comment') return [{ stage: 'public_comment', date: addDays(b.noticeEnd!, -39), institutionId: minister(b) }];
    let d = b.into ? hist.get(b.into)![0].date : b.last ?? weekdayOnly(addDays(BASE_DATE, -int(8, 70)));
    const rev: HistEntry[] = [];
    for (let i = chain.length - 1; i >= 0; i--) {
      const stage = chain[i];
      const inst = stage === 'public_comment' ? minister(b) : STAGE_INST[stage]?.(b.c);
      rev.push({ stage, date: d, ...(inst ? { institutionId: inst } : {}) });
      d = weekdayOnly(addDays(d, -int(5, 24)));
    }
    for (let k = 0; k < (b.burn ?? 0); k++) int(5, 24);
    const h = rev.reverse();
    // The 40-day notice closes months before submission: regulatory review, the Ministry of Government Legislation, the Cabinet and approval come between.
    if (b.ty === 'G' && h.length > 1) h[0].date = weekdayOnly(addDays(h[1].date, -(40 + 75 + int(0, 10))));
    if (b.then) h.push({ stage: b.then[0], date: b.then[1], institutionId: STAGE_INST[b.then[0]](b.c) });
    return h;
  };
  for (const b of [...B].sort((x, y) => (y.ty === 'A' ? 1 : 0) - (x.ty === 'A' ? 1 : 0))) hist.set(b.n, buildHist(b));

  const billId = (n: number) => `bill-${pad(n)}`;
  const billNo = (n: number) => `22-S${pad(n * 7 + 301, 4)}`;
  const billSpec = (id: string) => B.find((b) => billId(b.n) === id)!;
  // Group articles by act: "Articles 2 and 8-2 of the Road Traffic Act", "a new article to the Food Sanitation Act".
  const artKey = (a: string) => a.replace('Art. ', '').split('-').map(Number);
  const byArt = (x: string, y: string) => { const [a, b] = [artKey(x), artKey(y)]; return a[0] - b[0] || (a[1] ?? 0) - (b[1] ?? 0); };
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
  const amendsText = (provs: string[]) => {
    const byAct = new Map<string, string[]>();
    for (const p of provs) byAct.set(byId.get(p)!.instrument, [...(byAct.get(byId.get(p)!.instrument) ?? []), byId.get(p)!.article]);
    return [...byAct].map(([act, arts]) => {
      const nums = arts.filter((a) => a !== 'New article').sort(byArt).map((a) => a.replace('Art. ', ''));
      return nums.length ? `amend ${nums.length > 1 ? 'Articles' : 'Article'} ${list(nums)} of the ${act}` : `add an article to the ${act}`;
    }).join(' and ');
  };
  const defaultProv = (b: BillSpec) => b.iss.flatMap((i) => PROV_BY_ISSUE[i]).slice(0, b.ty === 'A' ? 3 : 2);
  for (const b of B) {
    const h = hist.get(b.n)!;
    const prov = b.prov ?? defaultProv(b);
    const subject = (b.ty === 'A' ? b.t.match(/^Committee Alternative: (.+) \(/)?.[1] : b.t.match(/\(([^)]+)\)$/)?.[1].replace(/^Government Bill: /, '')) ?? b.s;
    add('Bill', billId(b.n), {
      ...(b.st === 'public_comment' ? {} : { billNo: billNo(b.n) }), title: b.t, shortTitle: b.s,
      summary: b.sum ?? `Would ${amendsText(prov)} on ${subject.toLowerCase()}.`,
      billType: b.ty === 'L' ? 'lawmaker' : b.ty === 'G' ? 'government' : 'committee_alternative',
      stage: b.then?.[0] ?? b.st, stageHistory: h, proposedDate: h[0].date, ...(b.into ? { mergedInto: billId(b.into) } : {}),
    });
  }

  const pool = [...law, ...fepc];
  for (const b of B) {
    const id = billId(b.n);
    const h = hist.get(b.n)!;
    const prov = b.prov ?? defaultProv(b);
    for (const i of b.iss) link('about', id, i);
    for (const p of prov) link('amends', id, p);
    for (let k = prov.length; b.prov && k < defaultProv(b).length; k++) conf(0.95, 0.99); // keeps the random sequence of the default articles
    if (h.some((e) => e.stage === 'committee_referred') || b.ty === 'A') link('referred_to', id, `inst-${b.c}`);
    if (b.ty === 'L') {
      const cm = members[b.c];
      const lead = b.lead ? byId.get(b.lead)! : chance(0.75) ? pick(cm.slice(1)) : pick(pool);
      link('sponsors', lead.id, id);
      const fixed = b.cos ?? [];
      // Jang Sora (per-005) has said nothing on the sidewalk bills; keep her off their cosponsor lists.
      const others = sample(pool.filter((x) => x.id !== lead.id && !fixed.includes(x.id) && !(b.iss.includes('iss-01') && x.id === 'per-005')), int(2, 5));
      for (const p of [...fixed.map((x) => byId.get(x)!), ...others]) link('cosponsors', p.id, id);
    } else {
      link('sponsors', b.ty === 'G' ? minister(b) : `inst-${b.c}`, id);
    }
  }

  // ---- Events ----
  let evtN = 0;
  const events = new Map<string, ObjectRecord>(); // keyed by institution|date
  const newEvent = (name: string, kind: string, date: string, extra: Record<string, unknown> = {}): ObjectRecord =>
    add('Event', `evt-${pad(++evtN)}`, { name, kind, date, status: date <= BASE_DATE ? 'held' : 'scheduled', ...extra });
  const KIND_OF: Record<string, string> = { committee: 'full_committee', subcommittee: 'subcommittee', plenary: 'plenary' };
  const meetingName = (inst: string) => {
    const i = byId.get(inst)!;
    const c = (i.parentId ?? inst).replace('inst-', '');
    return i.kind === 'plenary' ? 'Plenary session' : i.kind === 'subcommittee' ? `${SHORT[c]} ${c === 'fepc' ? '' : 'bill review '}subcommittee` : `${SHORT[c]} Committee meeting`;
  };
  const eventAt = (inst: string, date: string): ObjectRecord => {
    const key = `${inst}|${date}`;
    if (!events.has(key)) events.set(key, newEvent(meetingName(inst), KIND_OF[byId.get(inst)!.kind], date, { institutionId: inst }));
    return events.get(key)!;
  };
  const agenda = (e: ObjectRecord, billNs: number[], note = 'The meeting agenda lists') => {
    for (const n of billNs) {
      link('agenda_item', e.id, billId(n), undefined, { excerpt: `${note} ${billRef(billId(n))}.`, sourceType: 'public_notice' });
      for (const i of billSpec(billId(n)).iss) if (!links.some((l) => l.type === 'about' && l.from === e.id && l.to === i)) link('about', e.id, i, undefined, { excerpt: `The agenda concerns ${byId.get(i)!.title.toLowerCase()}.` });
    }
  };

  // 1. Last stage change of each bill, if within the six-week window, becomes a held meeting.
  const windowStart = addDays(BASE_DATE, -42);
  for (const b of B) {
    const last = hist.get(b.n)!.at(-1)!;
    if (last.institutionId && last.date >= windowStart && last.date <= BASE_DATE && last.stage !== 'public_comment') agenda(eventAt(last.institutionId, last.date), [b.n], 'The minutes record the vote on');
  }
  // 2. Scheduled meetings. A full committee takes up bills that are referred but not yet on its agenda, and votes on bills
  // its subcommittee has passed; bills already on the agenda wait for the subcommittee.
  const SCHEDULED: [string, string, number[]][] = [
    ['inst-pasc', '2026-11-19', [1, 3]], ['inst-pasc-brs', '2026-11-26', [2]], ['inst-hwc-brs', '2026-11-18', [18, 19]], ['inst-hwc', '2026-11-24', [13, 14, 15, 16, 21]],
    ['inst-pac', '2026-11-19', [32]], ['inst-pac-brs', '2026-11-20', [23, 24, 30]], ['inst-fepc-brs', '2026-11-20', [28]], ['inst-tiec', '2026-11-20', [6, 12]],
    ['inst-tiec-brs', '2026-11-23', [5, 8, 11]], ['inst-ljc', '2026-11-23', [31, 33, 29]],
  ];
  for (const [inst, date, ns] of SCHEDULED) agenda(eventAt(inst, date), ns, 'The meeting notice lists');
  const meetingOf = (inst: string) => SCHEDULED.find(([i]) => i === inst)![1]; // dates quoted in client documents come from the schedule
  // 3. Notice periods for government bills (40 days; the event date is the closing date)
  for (const b of B.filter((x) => x.ty === 'G')) {
    const start = hist.get(b.n)![0].date;
    const closes = workdayOnOrAfter(addDays(start, 39)); // a notice that ends on a weekend runs to Monday
    const e = newEvent(`Notice period closes: ${b.s}`, 'public_comment', closes, { startDate: start, institutionId: minister(b), status: closes >= BASE_DATE ? 'scheduled' : 'held' });
    agenda(e, [b.n], 'The notice concerns');
  }
  // 4. Hearings, audit sessions, seminars
  const HEARINGS: [string, string, string, string, number[], string[]][] = [
    ['Public hearing on sidewalk rules for robots', 'hearing', '2026-10-27', 'inst-pasc', [1, 2], ['org-02', 'org-01', 'per-030']],
    ['Public hearing on novel food ingredient review', 'hearing', '2026-11-05', 'inst-hwc', [13, 14], ['org-06', 'org-09', 'per-031', 'org-07']],
    ['Public hearing on foreign payment providers', 'hearing', '2026-11-17', 'inst-pac', [23, 24], ['org-10', 'org-11', 'per-032', 'per-033']],
    ['Public hearing on labeling of cultivated protein', 'hearing', '2026-12-01', 'inst-hwc', [18, 19], ['org-06', 'org-08', 'org-07']],
    ['Parliamentary audit: National Police Agency', 'audit', '2026-10-13', 'inst-pasc', [], ['per-030']],
    ['Parliamentary audit: Ministry of Food and Drug Safety', 'audit', '2026-10-15', 'inst-hwc', [], ['per-031']],
    ['Parliamentary audit: Financial Services Commission', 'audit', '2026-10-20', 'inst-pac', [], ['per-032', 'per-033']],
  ];
  const AUDIT_ISSUES: Record<string, string[]> = { 'inst-pasc': ['iss-01'], 'inst-hwc': ['iss-05', 'iss-06'], 'inst-pac': ['iss-08', 'iss-09'] };
  for (const [name, kind, date, inst, ns, who] of HEARINGS) {
    const e = newEvent(name, kind, date, { institutionId: inst });
    if (ns.length) agenda(e, ns, 'The hearing notice lists');
    else for (const i of AUDIT_ISSUES[inst]) link('about', e.id, i, undefined, { excerpt: `The audit agenda covers ${byId.get(i)!.title.toLowerCase()}.` });
    for (const w of who) link('testifies_at', w, e.id, undefined, { excerpt: `The witness list names ${label(w)}.${said(w, e.id)}`, sourceType: 'public_notice' });
  }
  const SEMINARS: [string, string, string[], string[]][] = [
    ['Seminar: Sidewalk robots and pedestrian safety', '2026-10-21', ['iss-01', 'iss-02'], ['org-01', 'org-05', 'per-045', 'per-049']],
    ['Forum on cultivated protein governance', '2026-11-10', ['iss-05', 'iss-07'], ['org-06', 'org-09', 'per-050']],
    ['Workshop: Safeguarding prepaid balances', '2026-11-30', ['iss-09'], ['org-10', 'org-11']],
    ['Seminar: Cross-border data flows and payments', '2026-12-09', ['iss-10', 'iss-11'], ['org-10']],
  ];
  for (const [name, date, iss, who] of SEMINARS) {
    const e = newEvent(name, 'seminar', date);
    for (const i of iss) link('about', e.id, i, undefined, { excerpt: `The programme covers ${byId.get(i)!.title.toLowerCase()}.`, sourceType: 'public_notice' });
    for (const w of who) link('testifies_at', w, e.id, undefined, { excerpt: `The programme lists ${label(w)} as a speaker.${said(w, e.id)}`, sourceType: 'public_notice' });
  }
  // The lead ministry's official attends full committee meetings that consider its bills.
  const LEAD_OFFICIAL: Record<string, number> = { pasc: 1, hwc: 2, pac: 3, tiec: 6, fepc: 0 };
  for (const e of [...events.values()].filter((x) => x.kind === 'full_committee' && x.institutionId !== 'inst-ljc')) {
    const o = officials[LEAD_OFFICIAL[String(e.institutionId).replace('inst-', '')]];
    link('testifies_at', o.id, e.id, undefined, { excerpt: `The attendance record lists ${o.name} for the ministry.${said(o.id, e.id)}`, sourceType: 'public_notice' });
  }

  rnd(); // one draw fewer in the meeting records than in earlier worlds; keeps every signal below where it was
  // ---- Signals ----
  interface SigSpec { sourceType: string; title: string; rawText: string; at: string; issueId?: string; billIds: string[]; mentionIds: string[]; kind: 'bill_update' | 'filler' | 'noise' | 'near'; conf: number }
  const sigs: SigSpec[] = [];
  const time = () => ({ h: int(7, 21), m: int(0, 59) });

  let added = 0;
  for (const b of B) {
    for (const h of hist.get(b.n)!) {
      if (h.date < windowStart || h.date > BASE_DATE) continue;
      const t = b.then && h === hist.get(b.n)!.at(-1) ? (added++, { h: 19, m: 30 }) : time(); // a stage added after generation draws no random time
      const no = b.st === 'public_comment' ? undefined : billNo(b.n);
      const inst = h.institutionId ? byId.get(h.institutionId)!.name : 'the National Assembly';
      sigs.push(h.stage === 'public_comment' ? {
        sourceType: 'public_notice', kind: 'bill_update', conf: 0.97, at: iso(h.date, 9 + (t.h % 3), t.m), billIds: [billId(b.n)], issueId: b.iss[0], mentionIds: [minister(b)],
        title: `Legislative notice: ${b.s}`,
        rawText: `The ${inst} gives notice of ${b.t}. Written opinions are accepted for 40 days from ${monthDay(h.date)}.`,
      } : {
        sourceType: 'bill_update', kind: 'bill_update', conf: 0.97, at: iso(h.date, 18 + (t.h % 3), t.m), billIds: [billId(b.n)], issueId: b.iss[0],
        mentionIds: h.institutionId ? [h.institutionId] : [],
        title: `Bill ${no} ${STAGE_LABEL[h.stage]}`,
        rawText: `Assembly bill tracker: ${b.t} (${no}) is now ${STAGE_LABEL[h.stage]} as of ${monthDay(h.date)}. Body: ${inst}.`,
      });
    }
  }
  // Meeting notices for this week's and next week's scheduled meetings: the source for what is coming up.
  for (const e of objects.filter((x) => x.type === 'Event' && x.status === 'scheduled' && ['full_committee', 'subcommittee', 'hearing'].includes(x.kind))) {
    const t = time();
    const ns = links.filter((l) => l.type === 'agenda_item' && l.from === e.id).map((l) => l.to);
    const day = [addDays(e.date, -6), '2026-11-10', BASE_DATE].sort()[1]; // a week ahead, inside this week
    sigs.push({
      sourceType: 'public_notice', kind: 'bill_update', conf: 0.95, at: iso(weekdayOnly(day), 10, t.m), billIds: ns, issueId: billSpec(ns[0]).iss[0], mentionIds: [e.institutionId],
      title: `Notice: ${e.name}, ${monthDay(e.date)}`,
      rawText: `${e.name} on ${monthDay(e.date)}. The agenda lists ${ns.map((n) => `${byId.get(n)!.title} (${byId.get(n)!.billNo})`).join('; ')}.`,
    });
  }
  const NOISE_N = 8 + 3;
  const fillerN = 160 - (sigs.length - added) - NOISE_N;
  const issueWeights = ISSUES.flatMap(([id], i) => Array(i === 0 ? 4 : [2, 2, 2, 3, 3, 2, 3, 2, 3, 2][i - 1]).fill(id) as string[]);
  const daysAgo = () => Math.floor(42 * Math.pow(rnd(), 1.4));
  const titles = new Set<string>();

  for (let k = 0; k < fillerN; k++) {
    const issueId = pick(issueWeights);
    const meta = ISSUE_META[issueId];
    const sourceType = pick(['news', 'news', 'news', 'news', 'minutes', 'minutes', 'press_release', 'press_release', 'public_notice']);
    let [titleTpl, tpl] = pick(TEMPLATES[sourceType]);
    let topic = pick(meta.topics);
    // Minutes come from committees, notices from ministries; press releases and news from either.
    const inst = pick(sourceType === 'minutes' ? [`inst-${meta.committee}`, `inst-${meta.committee}-brs`] : sourceType === 'public_notice' ? meta.ministries : [`inst-${meta.committee}`, ...meta.ministries]);
    let person = pick(members[meta.committee]);
    const org = pick(meta.orgs);
    // A repeated headline is re-rolled so no two items share a title.
    const fillTitle = () => cap(titleTpl.replace('{topic}', topic).replace('{inst}', byId.get(inst)!.name).replace('{person}', person.name).replace('{org}', byId.get(org)!.name));
    for (let tries = 0; titles.has(fillTitle()) && tries < 6; tries++) ([titleTpl, tpl] = pick(TEMPLATES[sourceType]), topic = pick(meta.topics), person = pick(members[meta.committee]));
    titles.add(fillTitle());
    const bills = B.filter((b) => b.iss.includes(issueId) && !['merged_alternative', 'public_comment', 'withdrawn'].includes(b.st));
    const bill = chance(0.55) && bills.length ? pick(bills) : undefined;
    const mentionIds: string[] = [];
    const text = tpl
      .replace('{topic}', topic).replace('{outlet}', pick(OUTLETS))
      .replace('{inst}', () => (mentionIds.push(inst), byId.get(inst)!.name))
      .replace('{person}', () => (mentionIds.push(person.id), person.name)).replace('{party}', person.party ?? 'independent')
      .replace('{org}', () => (mentionIds.push(org), byId.get(org)!.name))
      + (bill ? ` The related bill is "${bill.t}" (${billNo(bill.n)}).` : '');
    const t = time();
    sigs.push({
      sourceType, kind: 'filler', issueId, conf: conf(), billIds: bill ? [billId(bill.n)] : [], mentionIds: [...new Set(mentionIds)],
      at: iso(addDays(BASE_DATE, -daysAgo()), t.h, t.m), rawText: text, title: fillTitle(),
    });
  }
  // Noise: five unprocessed items this week, three older ones already dismissed. Near misses share keywords with a tracked issue.
  NOISE.forEach((title, i) => {
    const t = time();
    const thisWeek = i < 5;
    sigs.push({ sourceType: pick(['news', 'press_release']), kind: 'noise', conf: 0, billIds: [], mentionIds: [], at: iso(addDays(BASE_DATE, thisWeek ? -int(1, 6) : -int(10, 38)), t.h, t.m), title, rawText: `${title}. No policy action is described.` });
  });
  NEAR_MISS.forEach(([title, text, issueId], i) => {
    const t = time();
    sigs.push({ sourceType: 'news', kind: 'near', conf: 0.5, issueId, billIds: [], mentionIds: [], at: iso(addDays(BASE_DATE, i === 1 ? -int(12, 30) : -int(1, 4)), t.h, t.m), title, rawText: text });
  });

  sigs.sort((a, b) => cmp(a.at, b.at) || cmp(a.title, b.title));
  // Eight older filler signals get weak person-mention evidence so the review queue is not empty.
  const weak = new Set(sigs.map((s, i) => (s.kind === 'filler' && s.at.slice(0, 10) <= WEEK_START && s.mentionIds.some((m) => m.startsWith('per-')) ? i : -1)).filter((i) => i >= 0).filter((_, j) => j % 6 === 0).slice(0, 8));
  sigs.forEach((s, i) => {
    const id = `sig-${pad(i + 1)}`;
    const thisWeek = s.at.slice(0, 10) > WEEK_START;
    const triaged = !thisWeek && s.kind !== 'noise';
    const dismissed = !thisWeek && s.kind === 'noise';
    const status = dismissed ? 'dismissed' : triaged ? 'triaged' : 'new';
    add('Signal', id, {
      sourceType: s.sourceType, title: s.title, url: `https://example.invalid/${s.sourceType.replace('_', '-')}/${id}`, collectedAt: s.at, rawText: s.rawText, status,
      ...(status === 'dismissed' ? { relevance: 0.05, dismissReason: 'Not relevant to any tracked issue' } : {}),
      ...(status === 'triaged' ? { relevance: s.kind === 'near' ? 0.45 : s.conf } : {}),
    });
    if (status !== 'triaged') return;
    const excerpt = s.rawText.split(/(?<=\.)\s+/)[0].slice(0, 220);
    const base = { signalId: id, excerpt, sourceType: s.sourceType, sourceUrl: `https://example.invalid/${s.sourceType.replace('_', '-')}/${id}` };
    if (s.kind === 'near') {
      link('about', id, s.issueId!, undefined, { ...base, confidence: conf(0.42, 0.55), review: true });
      return;
    }
    if (s.issueId) link('about', id, s.issueId, undefined, { ...base, confidence: s.conf, method: i % 7 === 0 ? 'human' : 'rule' });
    for (const b of s.billIds) link('mentions', id, b, undefined, { ...base, confidence: s.kind === 'bill_update' ? 0.98 : conf(0.88, 0.98) });
    for (const m of s.mentionIds) {
      const lowConf = weak.has(i) && m.startsWith('per-');
      link('mentions', id, m, undefined, { ...base, confidence: lowConf ? conf(0.52, 0.74) : conf(0.84, 0.98) });
    }
  });

  // Lawmakers who chaired or spoke at hearings and seminars. Fixed confidence, so the random sequence is unchanged.
  const eventNamed = (name: string) => objects.find((o) => o.type === 'Event' && o.name === name)!.id;
  const SPEAKERS: [string, string, string][] = [
    ['per-001', 'Public hearing on sidewalk rules for robots', 'The hearing record lists Seo Haeun as presiding member.'],
    ['per-003', 'Public hearing on sidewalk rules for robots', 'The hearing record lists Nam Eunbi as a questioner.'],
    ['per-002', 'Seminar: Sidewalk robots and pedestrian safety', 'The programme lists Baek Siwoo as a speaker.'],
    ['per-004', 'Seminar: Sidewalk robots and pedestrian safety', 'The programme lists Ryu Taehwan as a speaker.'],
    ['per-022', 'Seminar: Sidewalk robots and pedestrian safety', 'The programme lists Choi Haneul as a speaker.'],
    ['per-009', 'Forum on cultivated protein governance', 'The programme lists Oh Yeeun as a speaker.'],
    ['per-008', 'Public hearing on labeling of cultivated protein', 'The hearing notice lists Hwang Seungho as presiding member.'],
    ['per-016', 'Public hearing on foreign payment providers', 'The hearing notice lists Noh Dongha as a questioner.'],
    ['per-015', 'Public hearing on foreign payment providers', 'The hearing notice lists Go Mirae as presiding member.'],
    ['per-034', 'Seminar: Cross-border data flows and payments', 'The programme lists Gu Taeyoon as a speaker.'],
    ['org-12', 'Seminar: Cross-border data flows and payments', 'The programme lists Small Merchants Federation as a speaker.'],
  ];
  for (const [who, event, excerpt] of SPEAKERS) link('testifies_at', who, eventNamed(event), undefined, { excerpt: `${excerpt}${said(who, eventNamed(event))}`, sourceType: 'public_notice', confidence: 0.97 });

  // ---- Client layer ----
  const CLIENTS: [string, string, string, string][] = [
    ['cli-aster', 'Aster Robotics', 'Sidewalk delivery robots', 'Monitoring and advocacy on the outdoor mobile robot rules: sidewalk duties, safety certification, operator insurance and local pilot zones.'],
    ['cli-moru', 'Moru Foods', 'Cultivated protein foods', 'Monitoring and advocacy on novel food ingredient approval, labeling terms and the food-tech sandbox.'],
    ['cli-wren', 'Wrenfield Pay', 'Cross-border payments (foreign fintech entering Korea)', 'Monitoring and advocacy on electronic financial registration, prepaid balance protection, remittance limits and data transfer.'],
  ];
  const AFFECTS: Record<string, [string, string][]> = {
    'cli-aster': [['iss-01', 'high'], ['iss-02', 'high'], ['iss-03', 'medium'], ['iss-04', 'medium']],
    'cli-moru': [['iss-05', 'high'], ['iss-06', 'high'], ['iss-07', 'medium']],
    'cli-wren': [['iss-08', 'high'], ['iss-09', 'medium'], ['iss-10', 'high'], ['iss-11', 'medium']],
  };
  const WATCHED_BILLS: Record<string, number[]> = { 'cli-aster': [1, 2, 4, 5, 8, 11, 31], 'cli-moru': [13, 18, 21, 19], 'cli-wren': [23, 26, 28, 33] };
  for (const [id, name, sector, scope] of CLIENTS) {
    const key = id.slice(4);
    add('Client', id, { name, sector });
    add('Engagement', `eng-${key}`, { clientId: id, scope, team: [`consultant-${key}-1`, `consultant-${key}-2`], startDate: '2026-03-02' });
    const m = clientMarking(id);
    for (const [iss, impact] of AFFECTS[id]) {
      link('affects', iss, id, { impact }, false, m);
      link('watches', `eng-${key}`, iss, undefined, false, m);
    }
    for (const n of WATCHED_BILLS[id]) link('watches', `eng-${key}`, billId(n), undefined, false, m);
  }

  // Position rationales name the client: "we" on screen is the consulting team.
  const P = (clientKey: string, n: number, target: string, stance: string, rationale: string) =>
    add('ClientPosition', `pos-${clientKey}-${n}`, { clientId: `cli-${clientKey}`, targetId: target, stance, rationale, setBy: `consultant-${clientKey}-1`, approvedBy: 'principal-1' });
  P('aster', 1, 'bill-001', 'amend', 'Aster Robotics backs sidewalk access for cargo-class robots and wants the stop rule replaced by a duty to slow to walking pace and give way.');
  P('aster', 2, 'iss-02', 'support', 'Aster Robotics prefers one national certification path to separate city rules.');
  P('aster', 3, 'iss-03', 'amend', 'Aster Robotics accepts mandatory insurance if the minimum coverage scales with robot weight.');
  P('aster', 5, 'bill-008', 'amend', 'Aster Robotics accepts mandatory insurance if the minimum coverage scales with robot weight. The committee alternative on operator insurance leaves coverage amounts out, so this bill is where the point is still open.');
  P('aster', 6, 'bill-031', 'monitor', 'The committee has adopted this alternative, so its substance is settled. The Legislation and Judiciary Committee checks wording and can hold the bill back. Aster Robotics only tracks it and presses the coverage amounts on the weight-class bill, which is a separate text.');
  P('aster', 4, 'bill-011', 'support', 'Aster Robotics wants pilot zones to test new routes before national rules change.');
  P('moru', 1, 'iss-05', 'support', 'Moru Foods needs a fixed review period for novel ingredients more than any other change.');
  P('moru', 2, 'bill-013', 'amend', 'Moru Foods supports the recognition procedure and wants a statutory review deadline added.');
  P('moru', 3, 'bill-018', 'oppose', 'Moru Foods opposes a blanket ban on meat terms because it would block accurate descriptive labels.');
  P('moru', 4, 'iss-07', 'support', 'Moru Foods wants a sandbox that allows limited sales while review is pending.');
  P('wren', 1, 'bill-023', 'oppose', 'Wrenfield Pay cannot open a local office before launch and asks that a registered local agent meet the requirement instead.');
  P('wren', 2, 'iss-09', 'monitor', 'Wrenfield Pay already keeps prepaid funds in a segregated trust account and is waiting for the final standard.');
  P('wren', 3, 'bill-028', 'amend', 'Wrenfield Pay supports a higher limit and wants reporting handled automatically.');
  P('wren', 4, 'iss-11', 'amend', 'Wrenfield Pay needs standard contract clauses recognized as a lawful transfer route.');

  const I = (key: string, n: number, kind: string, date: string, who: number[], summary: string, targets: string[]) =>
    add('Interaction', `int-${key}-${n}`, { clientId: `cli-${key}`, kind, date, participantIds: who.map((w) => `per-${pad(w)}`), summary, targetIds: targets });
  I('aster', 1, 'meeting', '2026-10-14', [37], "Walked the committee chair's aide through Aster Robotics' route data. The aide asked for incident figures before the subcommittee took up the bill.", ['iss-01']);
  I('aster', 2, 'call', '2026-10-28', [45], 'The industry forum asked whether Aster Robotics would sign a joint statement on certification.', ['iss-02']);
  I('aster', 3, 'meeting', '2026-11-04', [30], 'The police agency official described how operator duties are enforced on sidewalks.', ['bill-004']);
  I('aster', 4, 'meeting', '2026-11-03', [36], 'The ministry official explained how pilot zone applications are reviewed.', ['iss-04']);
  I('moru', 1, 'meeting', '2026-10-16', [31], 'The agency explained the current review steps and typical timelines for novel ingredients.', ['iss-05']);
  I('moru', 2, 'call', '2026-10-30', [50], 'The council discussed a coordinated response on labeling terms.', ['iss-06']);
  I('moru', 3, 'meeting', '2026-11-06', [39], 'An aide to a health committee member asked for consumer research on label comprehension.', ['bill-018']);
  I('wren', 1, 'meeting', '2026-10-16', [32], 'The commission official outlined the registration review sequence for foreign providers.', ['iss-08']);
  I('wren', 2, 'call', '2026-10-29', [33], "The supervisory service asked for Wrenfield Pay's fund segregation procedure.", ['iss-09']);
  I('wren', 3, 'meeting', '2026-11-05', [42], 'An aide to a political affairs member asked what a local presence requirement would cost.', ['bill-023']);

  const D = (key: string, n: number, kind: string, title: string, status: string, body: string, extra: Record<string, unknown> = {}) => {
    add('Deliverable', `del-${key}-${n}`, { clientId: `cli-${key}`, kind, title, status, body, createdBy: kind === 'weekly_report' ? 'agent-1' : `consultant-${key}-1`, ...extra });
    link('produced_for', `del-${key}-${n}`, `eng-${key}`, undefined, false, clientMarking(`cli-${key}`));
  };
  const RESEARCH_DUE = '2026-11-17'; // Moru's label comprehension research: the client ask, and the date its meeting notes quote
  const COMMENTS_BY = '2026-11-26'; // Wrenfield's comments on the prepaid notice: the plan step, and the date its brief quotes
  const sentExtra = { approvedBy: 'principal-1', sentAt: '2026-11-09T10:00:00Z' };
  const md = (d: string) => monthDay(d);
  const lastOf = (n: number) => hist.get(n)!.at(-1)!.date;
  const ASTER_BRIEF = [
    '# Issue brief: sidewalk rules for outdoor mobile robots', '',
    '## Situation', '',
    `Since November 2023, certified outdoor mobile robots of up to 500 kg and 15 km/h count as pedestrians and may use sidewalks. The sidewalk robot duties bill (${billNo(1)}) passed the Public Administration and Security bill review subcommittee on ${md(lastOf(1))} and goes to the full committee on ${md(meetingOf('inst-pasc'))}.`, '',
    '## Client position', '',
    'Aster Robotics backs sidewalk access for cargo-class robots and wants the stop rule replaced by a duty to slow to walking pace and give way.', '',
    '## What changes', '',
    'The subcommittee text lets cargo-class robots up to 1,000 mm wide use sidewalks at least 3 m wide, but makes them stop for any pedestrian within 2 m. On narrower sidewalks that would stall most of Aster Robotics\' city routes.', '',
    '## Next steps', '',
    `We ask Baek Siwoo, the lead sponsor, to carry the slow-and-yield wording at the full committee on ${md(meetingOf('inst-pasc'))}, brief the subcommittee chair on the same wording, and tell the committee chair's office when the vote is expected. The industry forum is drafting a joint amendment that we will share with the sponsor and the subcommittee chair.`,
  ].join('\n');
  const ASTER_LETTER = [
    '# Comments on the sidewalk operation standards notice', '',
    'To the Traffic Safety Division, Korean National Police Agency', '',
    `Aster Robotics welcomes the government bill on sidewalk operation standards for outdoor mobile robots, open for comment until ${md(B.find((b) => b.n === 4)!.noticeEnd!)}. Standards set by robot class in the enforcement decree will let operators and police apply the same rules on every sidewalk.`, '',
    'We ask that the enforcement decree the bill authorizes add a cargo class for certified robots up to 1,000 mm wide, with a duty to slow to walking pace and give way to pedestrians rather than to stop. Our pilot route logs show that robots meeting this duty keep sidewalks moving while protecting pedestrians.', '',
    'We also ask that robots running inside a designated pilot zone be exempt in the decree from the width and speed limits for the length of the pilot, so cities can test new routes before national rules change. We would welcome the chance to share our route data with the Division.',
  ].join('\n');
  const MORU_NOTES = [
    '# Meeting notes: health committee aide', '',
    'The aide asked for evidence that shoppers understand descriptive terms on cultivated products. Talking points for the follow-up meeting:', '',
    `- Lead with the label comprehension research Moru Foods is preparing (due ${md(RESEARCH_DUE)}), in particular what it shows about the origin line on the front label.`,
    '- Moru Foods opposes a blanket ban on meat terms because it would block accurate descriptive labels; it supports a mandatory origin line instead.',
    `- The bill review subcommittee takes up the meat terms restriction bill on ${md(meetingOf('inst-hwc-brs'))}, so the research summary should reach the office before then.`,
  ].join('\n');
  const WREN_BRIEF = [
    '# Issue brief: prepaid balance safeguarding', '',
    '## Situation', '',
    `The Financial Services Commission has put a government bill on prepaid balance safeguarding out for legislative notice. Comments close on ${md(B.find((b) => b.n === 26)!.noticeEnd!)}. The commission must consider them but is not bound, and the text can still change in regulatory review, the Ministry of Government Legislation and the Cabinet before the bill reaches the National Assembly, usually months later.`, '',
    '## Client position', '',
    'Wrenfield Pay already keeps prepaid funds in a segregated trust account and has no position on the bill until the final standard is known.', '',
    '## What changes', '',
    'The bill would require every prepaid issuer to hold customer funds apart from operating funds, through a trust account or a payment guarantee.', '',
    '## Next steps', '',
    `We file comments by ${md(COMMENTS_BY)} asking that existing trust accounts count as compliant, and send the supervisory service the fund segregation procedure once Wrenfield Pay provides it.`,
  ].join('\n');
  D('aster', 1, 'weekly_report', 'Weekly report, week ending 2026-11-09', 'sent', '# Weekly report, week ending Nov 9: Aster Robotics\n\nThe sidewalk robot duties bill stayed in subcommittee review. The police agency notice on sidewalk operation standards is open until Dec 7.', sentExtra);
  D('aster', 2, 'issue_brief', 'Issue brief: sidewalk rules for outdoor mobile robots', 'approved', ASTER_BRIEF, { approvedBy: 'principal-1' });
  D('aster', 3, 'comment_letter', 'Draft comments on the sidewalk operation standards notice', 'draft', ASTER_LETTER);
  D('moru', 1, 'weekly_report', 'Weekly report, week ending 2026-11-09', 'sent', '# Weekly report, week ending Nov 9: Moru Foods\n\nThe novel ingredient bills were still in subcommittee. The meat terms bill was placed on the committee agenda.', sentExtra);
  D('moru', 2, 'meeting_prep', 'Meeting notes: health committee aide', 'in_review', MORU_NOTES);
  D('wren', 1, 'weekly_report', 'Weekly report, week ending 2026-11-09', 'sent', '# Weekly report, week ending Nov 9: Wrenfield Pay\n\nThe local presence bill was referred to the Political Affairs Committee.', sentExtra);
  D('wren', 2, 'issue_brief', 'Issue brief: prepaid balance safeguarding', 'draft', WREN_BRIEF);

  const T = (key: string, n: number, title: string, due: string, owner: string, status: string, subject?: string) =>
    add('Task', `task-${key}-${n}`, { clientId: `cli-${key}`, title, dueDate: due, owner, status, ...(subject ? { subjectId: subject } : {}) });
  // owner client = what the team needs from the client. A subject that is a person marks who the step is aimed at.
  T('aster', 1, 'Draft comments on the sidewalk operation standards notice', '2026-12-02', 'human', 'open', 'bill-004');
  T('aster', 2, 'Circulate the certification brief to the industry forum', '2026-11-06', 'human', 'done', 'iss-02');
  T('aster', 3, 'Update the sidewalk bill brief with the subcommittee text', '2026-11-18', 'agent', 'open', 'bill-001');
  T('aster', 4, "Brief Seo Haeun's office on the timing of the committee vote", '2026-11-18', 'human', 'open', 'per-001');
  T('aster', 5, 'Brief Ryu Taehwan on the slow-and-yield wording', '2026-11-18', 'human', 'open', 'per-004');
  T('aster', 6, 'Send test results to the industry subcommittee members', '2026-11-20', 'human', 'open', 'bill-005');
  T('aster', 7, 'Draft a coverage table scaled by robot weight', '2026-11-20', 'human', 'open', 'bill-008');
  T('aster', 8, 'Cargo model width and stopping-distance data', '2026-11-17', 'client', 'open', 'bill-001');
  T('aster', 9, 'Name who attends the meeting with the lead sponsor (CEO or CTO)', '2026-11-18', 'client', 'open', 'bill-001');
  T('aster', 10, 'List of cities for pilot zones', '2026-12-01', 'client', 'open', 'bill-004');
  T('aster', 11, 'Meet the Pedestrian Rights Network on the slow-and-yield wording', '2026-11-20', 'human', 'open', 'org-02');
  T('moru', 1, 'Prepare a position note for the sandbox coalition', '2026-11-20', 'human', 'open', 'bill-021');
  T('moru', 2, 'Send thanks to the agency contact after the October meeting', '2026-10-20', 'human', 'done');
  T('moru', 3, "Send review-deadline wording to Oh Yeeun's office", '2026-11-20', 'human', 'open', 'per-009');
  T('moru', 4, 'Meet Consumer Labeling Watch on origin-label wording', '2026-11-17', 'human', 'open', 'org-08');
  T('moru', 5, 'Consumer research on label comprehension', RESEARCH_DUE, 'client', 'open', 'bill-018');
  T('moru', 6, 'Sign off the coalition letter wording', '2026-11-19', 'client', 'open', 'bill-021');
  T('wren', 1, 'Draft the local agent proposal for the committee', '2026-11-18', 'human', 'open', 'bill-023');
  T('wren', 2, 'Track comments filed on the prepaid safeguarding notice', '2026-11-27', 'agent', 'open', 'bill-026');
  T('wren', 3, 'File the data transfer clause comparison', '2026-11-02', 'human', 'done', 'iss-11');
  T('wren', 4, 'File comments on the prepaid safeguarding notice', COMMENTS_BY, 'human', 'open', 'bill-026');
  T('wren', 5, 'Brief the economy and finance subcommittee members on reporting', '2026-11-19', 'human', 'open', 'bill-028');
  T('wren', 6, 'Cost estimate for opening a local office', '2026-11-18', 'client', 'open', 'bill-023');
  T('wren', 7, 'Fund segregation procedure in Korean and English', '2026-11-20', 'client', 'open', 'bill-026');

  // Stakeholder assessments. A stance needs a basis: a sponsorship, a statement at an event, a meeting or a news item.
  const issueOfBill = (b: string) => billSpec(b).iss;
  const basisFor = (key: string, subject: string, issue: string): string[] => {
    // A sponsorship counts only on a bill this client follows; cosponsoring some other bill on the issue says little.
    const bills = links.filter((l) => (l.type === 'sponsors' || l.type === 'cosponsors') && l.from === subject && issueOfBill(l.to).includes(issue) && WATCHED_BILLS[`cli-${key}`].includes(Number(l.to.slice(5)))).map((l) => l.to);
    const evs = links.filter((l) => l.type === 'testifies_at' && l.from === subject && links.some((a) => a.type === 'about' && a.from === l.to && a.to === issue)).map((l) => l.to);
    const meetings = objects.filter((o) => o.type === 'Interaction' && o.clientId === `cli-${key}` && o.participantIds.includes(subject)).map((o) => o.id);
    const accepted = (l: LinkRecord) => l.evidence.every((e) => byId.get(e)?.reviewStatus === 'accepted');
    const news = links.filter((l) => l.type === 'mentions' && l.to === subject && accepted(l) && links.some((a) => a.type === 'about' && a.from === l.from && a.to === issue && accepted(a)))
      .map((l) => l.from).sort((a, b) => cmp(byId.get(b)!.collectedAt, byId.get(a)!.collectedAt));
    return [...bills, ...evs, ...meetings, ...news].slice(0, 3);
  };
  const sponsorOf = (b: string) => links.find((l) => l.type === 'sponsors' && l.to === b)!.from;
  const SA: [string, string, string, string, string, string, string][] = [
    ['aster', 'per-001', 'iss-01', 'supportive', 'high', 'high', 'Committee chair. Cosponsored the bill and wants a result this session.'],
    ['aster', 'per-002', 'iss-01', 'supportive', 'high', 'high', 'Lead sponsor. Shops in the district rely on robot delivery.'],
    ['aster', 'per-004', 'iss-01', 'supportive', 'high', 'high', 'Chaired the subcommittee vote on Nov 12. Backs the bill, stop rule included, but wants wider consultation and a slower timetable.'],
    ['aster', 'per-005', 'iss-01', 'unconfirmed', 'high', 'medium', 'Minority secretary of the committee. No public statement on the bill.'],
    ['aster', 'per-003', 'iss-01', 'neutral', 'medium', 'medium', 'Lead sponsor of the pedestrian priority zones bill. Wants safety rules rather than a ban.'],
    ['aster', 'org-01', 'iss-01', 'supportive', 'medium', 'high', 'Industry forum. Drafting a joint amendment on the stop rule.'],
    ['aster', 'org-02', 'iss-01', 'opposed', 'medium', 'high', 'Wants the stop rule kept and applied to every sidewalk.'],
    ['aster', 'org-03', 'iss-01', 'unconfirmed', 'low', 'medium', 'Concerned about older pedestrians on narrow sidewalks.'],
    ['aster', 'per-030', 'iss-01', 'neutral', 'medium', 'high', 'The police agency enforces operator duties on sidewalks.'],
    ['aster', 'per-022', 'iss-02', 'neutral', 'high', 'high', 'Chairs the industry committee.'],
    ['aster', 'org-05', 'iss-02', 'neutral', 'medium', 'medium', 'Research institute that drafts the certification tests.'],
    ['aster', 'org-04', 'iss-03', 'unconfirmed', 'low', 'medium', 'Delivery workers union. Wants operators to carry the liability.'],
    ['aster', 'per-036', 'iss-04', 'supportive', 'medium', 'high', 'The ministry runs the regulation-free zone program.'],
    ['moru', 'per-011', 'iss-06', 'unconfirmed', 'high', 'high', 'Chairs the bill review subcommittee that takes up the meat terms bill.'],
    ['moru', 'per-008', 'iss-06', 'unconfirmed', 'high', 'medium', 'Committee chair.'],
    ['moru', sponsorOf('bill-018'), 'iss-06', 'opposed', 'high', 'high', 'Lead sponsor of the meat terms restriction.'],
    ['moru', 'org-07', 'iss-06', 'opposed', 'high', 'high', 'Livestock producers back the restriction.'],
    ['moru', 'org-08', 'iss-06', 'neutral', 'medium', 'medium', 'Consumer group. Cares about a clear origin label.'],
    ['moru', 'org-06', 'iss-06', 'supportive', 'medium', 'high', 'Industry council. Closest ally on labeling.'],
    ['moru', 'per-009', 'iss-05', 'supportive', 'high', 'high', 'Lead sponsor of the recognition procedure bill.'],
    ['moru', 'per-031', 'iss-05', 'neutral', 'medium', 'high', 'Agency director for novel food evaluation.'],
    ['moru', 'org-06', 'iss-05', 'supportive', 'medium', 'high', 'Industry council. Wants the same review deadline.'],
    ['moru', 'org-09', 'iss-07', 'supportive', 'low', 'medium', 'Research hub. Supports supervised trials.'],
    ['wren', 'per-015', 'iss-08', 'unconfirmed', 'high', 'high', 'Chairs the Political Affairs Committee.'],
    ['wren', sponsorOf('bill-023'), 'iss-08', 'opposed', 'high', 'high', 'Lead sponsor of the local presence requirement.'],
    ['wren', 'per-016', 'iss-08', 'neutral', 'medium', 'medium', 'Committee member. Asks about consumer redress.'],
    ['wren', 'org-10', 'iss-08', 'supportive', 'medium', 'high', 'Fintech association. Prefers a local agent rule.'],
    ['wren', 'org-11', 'iss-09', 'opposed', 'medium', 'medium', 'Consumer group pushing stricter fund rules.'],
    ['wren', 'per-033', 'iss-09', 'neutral', 'medium', 'high', 'Supervisory service. Asked for the segregation procedure.'],
    ['wren', 'per-029', 'iss-10', 'neutral', 'medium', 'high', 'Ministry director for the foreign exchange system.'],
    ['wren', 'org-12', 'iss-10', 'supportive', 'low', 'medium', 'Small merchants want cheaper transfers.'],
    ['wren', 'per-034', 'iss-11', 'neutral', 'medium', 'high', 'Data policy director at the commission.'],
    ['wren', 'per-018', 'iss-08', 'unconfirmed', 'high', 'high', 'Chairs the bill review subcommittee that takes up the local presence bill.'],
  ];
  const saId = new Map<string, string>(); // key|subject|issue -> id
  const saCount: Record<string, number> = {};
  for (const [key, subject, issue, stance, influence, relevance, interests] of SA) {
    const id = `sa-${key}-${pad((saCount[key] = (saCount[key] ?? 0) + 1), 2)}`;
    const basisIds = basisFor(key, subject, issue);
    if (stance !== 'unconfirmed' && !basisIds.length) throw new Error(`${id}: ${subject} has no basis for '${stance}' on ${issue}`);
    if (saId.has(`${key}|${subject}|${issue}`)) throw new Error(`${id}: duplicate assessment of ${subject} on ${issue}`);
    add('StakeholderAssessment', id, {
      clientId: `cli-${key}`, subjectId: subject, issueId: issue, stance, influence, relevance,
      ...(basisIds.length ? { basisIds } : {}), interests, assessedBy: `consultant-${key}-1`, assessedAt: '2026-11-13',
    });
    saId.set(`${key}|${subject}|${issue}`, id);
  }
  const sa = (key: string, subject: string, issue: string) => saId.get(`${key}|${subject}|${issue}`)!;

  const RO = (key: string, n: number, kind: string, title: string, summary: string, impact: string, urgency: string, subjectIds: string[], dueDate?: string) =>
    add('RiskOpportunity', `ro-${key}-${n}`, { clientId: `cli-${key}`, kind, title, summary, impact, urgency, ...(dueDate ? { dueDate } : {}), subjectIds, addedBy: `consultant-${key}-1`, approvedBy: 'principal-1' });
  RO('aster', 1, 'risk', 'Stop rule for pedestrians', 'The subcommittee text makes robots stop for any pedestrian within 2 m. On sidewalks under 3 m wide that would stall most of Aster Robotics\' city routes.', 'high', 'imminent', ['bill-001']);
  RO('aster', 2, 'risk', 'A single certification body', 'The government bill would move certification to one designated body. New models could wait months for a certificate.', 'medium', 'in_progress', ['bill-007']);
  RO('aster', 3, 'opportunity', 'Cargo class in the enforcement decree', 'The police agency notice is open for comment. The bill leaves robot classes and operation standards to an enforcement decree, so comments can ask that the decree include a cargo class and pilot zone exemptions. The bill amends the same article as the sidewalk robot duties bill, so the committee may fold the two together once it is submitted.', 'high', 'ongoing', ['bill-004'], '2026-12-07');
  RO('aster', 4, 'opportunity', 'Joint amendment with the industry forum', 'Other operators back the same slow-and-yield wording. A joint text carries more weight with the committee.', 'medium', 'ongoing', ['iss-01']);
  RO('moru', 1, 'risk', 'Ban on meat terms', 'A blanket ban would force Moru Foods to relabel every product.', 'high', 'imminent', ['bill-018']);
  RO('moru', 2, 'risk', 'No review deadline in the combined text', 'The subcommittee reviewed the three lawmaker bills and the government bill together and passed one text without a fixed review period.', 'medium', 'in_progress', ['bill-013']);
  RO('moru', 3, 'opportunity', 'Food-tech sandbox', 'A sandbox bill would allow limited sales while ingredient review is pending.', 'medium', 'ongoing', ['bill-021']);
  RO('wren', 1, 'risk', 'Local presence requirement', 'The bill would require a local office before registration, which would delay launch. The subcommittee reviews it together with the capital requirement bill, which amends the same articles, so one combined text leaves the subcommittee.', 'high', 'imminent', ['bill-023']);
  RO('wren', 2, 'risk', 'Stricter prepaid fund rules', 'The commission\'s notice on prepaid safeguarding is open for comment.', 'medium', 'in_progress', ['bill-026'], '2026-11-27');
  RO('wren', 3, 'opportunity', 'Higher remittance limit', 'The remittance bill would raise the annual limit for small remittance providers.', 'high', 'in_progress', ['bill-028']);
  RO('wren', 4, 'opportunity', 'Standard contract clauses', 'The data transfer bills are early; clauses could become the accepted transfer route.', 'medium', 'ongoing', ['iss-11']);

  const STR = (key: string, issue: string, desiredOutcome: string, messages: string[], targets: string[], allyIds: string[], tasks: number[]) =>
    add('Strategy', `str-${key}-${issue.slice(4)}`, {
      clientId: `cli-${key}`, issueId: issue, desiredOutcome, messages, targetIds: targets.map((s) => sa(key, s, issue)), allyIds,
      planTaskIds: tasks.map((n) => `task-${key}-${n}`), updatedBy: `consultant-${key}-1`, approvedBy: 'principal-1',
    });
  STR('aster', 'iss-01', 'Aster Robotics runs cargo models on city sidewalks next year under a yield rule its robots already meet.',
    ['Pilot route logs show robots already slow to walking pace near pedestrians.', 'A robot that stops dead on a narrow sidewalk blocks people longer than one that slows and moves aside.', 'Cargo-class robots carry the pharmacy and grocery orders small shops cannot send by motorbike.'],
    ['per-002', 'per-004', 'org-02', 'per-003'], ['org-01', 'org-13'], [4, 5, 11, 8, 9, 3]);
  STR('aster', 'iss-02', 'One national certification path with recognized test bodies, in force before the next model launch.',
    ['City-by-city rules would mean testing the same robot several times.', 'Recognizing existing test bodies avoids a certification backlog.'],
    ['per-022', 'org-05'], ['org-01'], [2, 6]);
  STR('aster', 'iss-03', 'Mandatory insurance with minimum coverage scaled by robot weight.',
    ['Coverage should scale with weight and speed, as it does for other machines.', 'A flat minimum prices small operators out of the market.'],
    ['org-04'], ['org-01'], [7]);
  STR('aster', 'iss-04', 'Cities can designate robot pilot zones, and more cities join next year.',
    ['Pilot zones let cities test before national rules change.', 'Aster Robotics can commit routes in three cities once zones are approved.'],
    ['per-036'], ['org-01', 'org-13'], [1, 10]);
  STR('moru', 'iss-05', 'A statutory review deadline for novel ingredients written into the committee alternative.',
    ['Without a deadline, review can take years and investment goes abroad.', 'Other markets set fixed review periods with the same safety bar.'],
    ['per-009', 'per-031'], ['org-06', 'org-09'], [3]);
  STR('moru', 'iss-06', 'Descriptive terms such as "cultivated meat" stay allowed with a clear origin label.',
    ['Consumers understand descriptive terms when the origin is on the front label.', 'Research on label comprehension shows the origin line matters more than the noun.'],
    ['per-011', sponsorOf('bill-018'), 'org-08'], ['org-06'], [4, 5]);
  STR('moru', 'iss-07', 'A food-tech sandbox with time-limited sales permits while review is pending.',
    ['Supervised sales build the safety record regulators ask for.', 'Permits should carry a review deadline so they do not lapse.'],
    ['org-09'], ['org-06'], [1, 6]);
  STR('wren', 'iss-08', 'Wrenfield Pay registers and launches next year without opening a local office.',
    ['A local agent gives regulators the same reach as a local office.', 'A presence rule delays entry and keeps fees high for users.'],
    ['per-018', 'per-015', sponsorOf('bill-023'), 'per-016'], ['org-10'], [1, 6]);
  STR('wren', 'iss-09', 'Segregation rules that accept trust accounts already in use.',
    ['Customer funds held in a segregated trust account are protected the same way.', 'Rules should accept trust accounts and payment guarantees alike.'],
    ['per-033', 'org-11'], ['org-10'], [4, 7, 2]);
  STR('wren', 'iss-10', 'A higher annual remittance limit with a simple reporting path.',
    ['Higher limits let migrant workers send money home at lower cost.', 'Automatic reporting gives the ministry the same data without a filing per transfer.'],
    ['per-029', 'org-12'], ['org-10', 'org-12'], [5]);
  STR('wren', 'iss-11', 'Standard contract clauses recognized as a lawful transfer route.',
    ['Standard clauses protect data abroad without forcing local servers.', 'Clear clauses make supervision easier for the commission.'],
    ['per-034'], ['org-10'], [3]);

  // Monitoring profiles: what each client asked us to watch.
  const K = (term: string, priority: string, synonyms: string[] = [], exclude: string[] = []) => ({ term, priority, ...(synonyms.length ? { synonyms } : {}), ...(exclude.length ? { exclude } : {}) });
  const MP = (key: string, objectives: [string, number][], keywords: ReturnType<typeof K>[], committees: string[], agencies: string[]) =>
    add('MonitoringProfile', `mp-${key}`, {
      clientId: `cli-${key}`, objectives: objectives.map(([text, priority]) => ({ text, priority })), keywords, committees, agencies,
      sources: ['bill_update', 'minutes', 'public_notice', 'press_release', 'news'], updatedBy: `consultant-${key}-1`, approvedBy: 'principal-1',
    });
  MP('aster', [
    ['Run cargo-class robots on city sidewalks next year under a slow-and-yield rule', 1],
    ['One national safety certification path with recognized test bodies', 2],
    ['Operator insurance with minimum coverage scaled by robot weight', 3],
    ['More cities designate robot pilot zones', 3],
  ], [
    K('outdoor mobile robot', 'high', ['delivery robot', 'sidewalk robot']),
    K('sidewalk', 'high', [], ['repaving', 'foot traffic']),
    K('safety certification', 'high', ['test body', 'certification renewal']),
    K('pedestrian priority', 'medium', ['give way']),
    K('liability insurance', 'medium', ['mandatory insurance', 'insurance coverage', 'operator liability']),
    K('pilot zone', 'medium', ['regulation-free zone']),
    K('Road Traffic Act', 'low'),
  ], ['inst-pasc', 'inst-pasc-brs', 'inst-tiec', 'inst-tiec-brs'], ['inst-npa', 'inst-motir', 'inst-mss']);
  MP('moru', [
    ['A statutory review deadline for novel ingredients', 1],
    ['Descriptive terms such as "cultivated meat" stay allowed with an origin label', 1],
    ['Time-limited sales permits while review is pending', 2],
  ], [
    K('novel food', 'high', ['ingredient approval', 'novel ingredient']),
    K('cultivated protein', 'high', ['cell-cultured', 'cultivated meat']),
    K('meat terms', 'high', ['meat naming', 'label wording', 'labeling standard']),
    K('cell-based', 'medium'),
    K('regulatory sandbox', 'medium', ['temporary permit']),
    K('food-tech', 'low'),
  ], ['inst-hwc', 'inst-hwc-brs'], ['inst-mfds']);
  MP('wren', [
    ['Register and launch next year without opening a local office', 1],
    ['A higher annual remittance limit with automatic reporting', 2],
    ['Segregation rules that accept existing trust accounts', 2],
    ['Standard contract clauses recognized for data transfer', 3],
  ], [
    K('electronic financial', 'high', ['local presence', 'foreign provider', 'registration requirement']),
    K('remittance', 'high', ['transfer limit', 'cross-border payment']),
    K('prepaid', 'medium', ['customer funds', 'safeguarding', 'segregation'], ['bank branch']),
    K('data transfer', 'medium', ['overseas transfer', 'data localization']),
    K('foreign exchange', 'low'),
    K('personal information', 'low'),
  ], ['inst-pac', 'inst-pac-brs', 'inst-fepc', 'inst-fepc-brs'], ['inst-fsc', 'inst-fss', 'inst-mofe', 'inst-pipc']);

  // Wrenfield Pay's two-week trial. The client listed twelve must-catch items: nine were caught (seven matched by link,
  // two by headline), three never reached the collector. Of the other caught items, two were judged irrelevant.
  const PILOT_FROM = '2026-10-12';
  const PILOT_TO = '2026-10-25';
  const caughtIds = pilotCatch(objects.filter((o) => o.type === 'Signal'), byId.get('mp-wren')!, PILOT_FROM, PILOT_TO);
  const sigUrl = (id: string) => { if (!caughtIds.includes(id)) throw new Error(`pilot: ${id} is not caught`); return byId.get(id)!.url as string; };
  const EXPECTED: [string, string, number, string?][] = [ // [client's title, caught signal (or source type when missed), days from publication to collection, missed url]
    ['Data transfer bill goes to subcommittee review', 'sig-020', 0],
    ['Capital requirement bill goes to subcommittee review', 'sig-021', 1],
    [byId.get('sig-022')!.title, 'sig-022', 0],
    ['FSC review of prepaid fund segregation', 'sig-034', 1],
    ['Legislative notice on prepaid safeguarding', 'sig-039', 2],
    ['Lawmaker statement on registration requirements', 'sig-043', 1],
    [byId.get('sig-047')!.title, 'sig-047', 1],
    ['Press coverage of the local presence debate', 'sig-059', 3],
    ['Subcommittee discussion of remittance reporting thresholds', 'sig-062', 0],
    ['FSC guidance on registration documents for foreign payment providers (Ref. FSC-PG-26-0473-Q)', 'press_release', 0, 'https://example.invalid/press-release/fsc-registration-guidance'],
    ['Ministry notice on remittance reporting forms', 'public_notice', 0, 'https://example.invalid/public-notice/mofe-remittance-forms'],
    ['Feature: foreign fintech firms weigh entry as rules tighten', 'news', 0, 'https://example.invalid/news/fintech-entry-feature'],
  ];
  const MISSED_DATE: Record<string, string> = { press_release: '2026-10-16', public_notice: '2026-10-21', news: '2026-10-22' };
  const expected = EXPECTED.map(([title, ref, lag, missedUrl], i) => {
    const sig = byId.get(ref);
    const byTitle = sig && title === sig.title;
    return {
      id: `exp-${i + 1}`, title, ...(sig ? (byTitle ? {} : { url: sigUrl(ref) }) : { url: missedUrl }),
      date: sig ? addDays(String(sig.collectedAt).slice(0, 10), -lag) : MISSED_DATE[ref], sourceType: sig ? sig.sourceType : ref,
    };
  });
  const CALLS: Record<string, string> = { 'sig-015': 'relevant', 'sig-025': 'relevant', 'sig-041': 'irrelevant', 'sig-052': 'irrelevant' };
  for (const id of Object.keys(CALLS)) sigUrl(id);
  add('PilotEvaluation', 'pilot-wren-1', {
    clientId: 'cli-wren', title: 'Two-week trial', from: PILOT_FROM, to: PILOT_TO, status: 'open',
    criteria: { access: 1, officialMisses: 0, noise: 0.2 }, expected,
    caught: caughtIds.map((signalId) => ({ signalId, ...(CALLS[signalId] ? { relevance: CALLS[signalId] } : {}) })),
    startedBy: 'consultant-wren-1',
  });

  // Earlier decisions. This week's are raised by the weekly assistant.
  const DEC = (key: string, n: number, question: string, rec: string, alts: string[], status: string, subject: string, raisedBy: string, extra: Record<string, unknown> = {}) => {
    add('Decision', `dec-${key}-${n}`, { clientId: `cli-${key}`, question, recommendation: rec, alternatives: alts, status, subjectId: subject, openedAt: iso(BASE_DATE, 8, 0), ...extra });
    link('raised_by', `dec-${key}-${n}`, raisedBy, undefined, false, clientMarking(`cli-${key}`));
  };
  DEC('aster', 1, 'Join the industry forum joint statement on certification?', 'Join, with a footnote reserving the weight-class point.', ['Join as drafted', 'Decline and send a separate letter'], 'resolved', 'iss-02', 'task-aster-2',
    { openedAt: '2026-10-29T09:00:00Z', resolution: 'approve', resolutionNote: 'Join with the footnote.', resolvedBy: 'principal-1' });
  DEC('moru', 1, 'Sign the sandbox coalition letter on the food-tech bill?', 'Sign, and ask the coalition to add a review deadline for temporary permits.', ['Sign as drafted', 'Support in a separate letter', 'Stay out'], 'open', 'bill-021', 'task-moru-1',
    { openedAt: '2026-11-13T09:00:00Z', dueDate: '2026-11-19', followUp: 'Sign the sandbox coalition letter and ask for a permit review deadline' });
  DEC('wren', 1, 'Publish a comment on the data transfer bill?', 'Not yet. The bill is at an early stage and a public comment would fix the position too soon.', ['Publish a short comment'], 'resolved', 'iss-11', 'task-wren-3',
    { openedAt: '2026-10-28T09:00:00Z', resolution: 'approve', resolutionNote: 'Hold.', resolvedBy: 'principal-1' });

  // Stable order: schema order, then id.
  const typeRank = Object.keys(objectTypes);
  objects.sort((a, b) => typeRank.indexOf(a.type) - typeRank.indexOf(b.type) || cmp(a.id, b.id));
  return {
    meta: { baseDate: BASE_DATE, seed: SEED, synthetic: true, description: 'Synthetic sample world. All clients, people, bills, events and signals are fictional.' },
    objects, links,
  };
}

/** One record per line keeps diffs reviewable. */
export function serializeWorld(w: World): string {
  const lines = (xs: unknown[]) => xs.map((x) => `    ${JSON.stringify(x)}`).join(',\n');
  return `{\n  "meta": ${JSON.stringify(w.meta)},\n  "objects": [\n${lines(w.objects)}\n  ],\n  "links": [\n${lines(w.links)}\n  ]\n}\n`;
}

if (import.meta.main) {
  const { writeFileSync } = await import('node:fs');
  const w = generateWorld();
  writeFileSync(new URL('./world.json', import.meta.url), serializeWorld(w));
  const counts: Record<string, number> = {};
  for (const o of w.objects) counts[o.type] = (counts[o.type] ?? 0) + 1;
  console.log(JSON.stringify(counts), `links=${w.links.length}`);
}
