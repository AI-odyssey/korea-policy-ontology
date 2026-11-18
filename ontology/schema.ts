// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Declarative ontology for Korean legislative monitoring.
// Vocabulary follows Foundry: object types, link types, action types, functions, markings.
// Nothing here executes; runtime.ts, validate.ts and render-docs.ts all read these tables.

export const ROLES = ['system', 'agent', 'consultant', 'principal'] as const;
export type Role = (typeof ROLES)[number];

/** A marking restricts who can see an object: PUBLIC, or one client's layer. */
export type Marking = 'PUBLIC' | `CLIENT:${string}`;
export type Layer = 'public' | 'client';

export type PropType =
  | 'string' | 'text' | 'number' | 'boolean' | 'date' | 'datetime'
  | 'enum' | 'string[]' | 'ref' | 'ref[]' | 'json';

export interface PropertyDef {
  type: PropType;
  required?: boolean;
  values?: readonly string[]; // enum members
  refTypes?: readonly string[]; // allowed target object types for ref / ref[]; omitted = any
  min?: number;
  max?: number;
  note?: string;
}

const req = (type: PropType, extra: Partial<PropertyDef> = {}): PropertyDef => ({ type, required: true, ...extra });
const opt = (type: PropType, extra: Partial<PropertyDef> = {}): PropertyDef => ({ type, ...extra });

// Bill lifecycle. Order matters: updateBillStage only moves forward along STAGE_ORDER.
export const STAGE_ORDER = [
  'public_comment', // government bills: 40-day legislative notice (입법예고)
  'submitted',
  'committee_referred',
  'committee_review', // placed on the standing committee agenda (상정)
  'subcommittee', // bill review subcommittee (법안심사소위)
  'subcommittee_passed',
  'committee_passed', // full committee vote (전체회의 의결)
  'lj_review', // Legislation and Judiciary Committee, systematic and wording review (체계자구심사)
  'plenary_pending',
  'passed',
] as const;
export const TERMINAL_STAGES = ['merged_alternative', 'withdrawn'] as const; // 대안반영폐기, 철회
export const BILL_STAGES = [...STAGE_ORDER, ...TERMINAL_STAGES] as const;
export type BillStage = (typeof BILL_STAGES)[number];

export const REVIEW_THRESHOLD = 0.8; // Evidence below this confidence goes to the human review queue

export const STANCES = ['supportive', 'neutral', 'opposed', 'unconfirmed'] as const;
export const LEVELS = ['high', 'medium', 'low'] as const;
export const URGENCY = ['imminent', 'in_progress', 'ongoing'] as const;
export const TASK_OWNERS = ['human', 'agent', 'client'] as const;
export const BASIS_TYPES = ['Bill', 'Event', 'Signal', 'Interaction'] as const;
export const SOURCE_TYPES = ['bill_update', 'press_release', 'public_notice', 'news', 'minutes', 'seminar', 'ministry_press', 'gazette'] as const;
/** synthetic: generated for the fictional world. public: a real public record collected by ingest/ (Signal and Evidence only). */
export const PROVENANCE = ['synthetic', 'public'] as const;
/** Pass criteria a trial starts with: every source reached, no missed Assembly or government item, noise at most 20%. */
export const PILOT_CRITERIA = { access: 1, officialMisses: 0, noise: 0.2 } as const;

export interface ObjectTypeDef {
  layer: Layer;
  description: string;
  properties: Record<string, PropertyDef>;
}

// Every object also carries: id, type, markings, synthetic, and optionally provenance. Only Signal and Evidence may be
// public records (provenance public, synthetic false); everything else, people and the whole client layer included, is synthetic.
export const objectTypes = {
  // ---- Public layer ----
  Issue: {
    layer: 'public',
    description: 'A policy topic that bills, events and signals are about.',
    properties: { title: req('string'), summary: req('text'), keywords: req('string[]', { note: "Routes an item to an issue. How much the item matters to a client comes from that client's MonitoringProfile." }) },
  },
  Bill: {
    layer: 'public',
    description: 'A bill before the National Assembly, with its stage history.',
    properties: {
      billNo: opt('string', { note: 'Assigned when the bill is submitted to the National Assembly. A government bill still in legislative notice has none.' }),
      title: req('string'),
      shortTitle: opt('string', { note: 'The working name used in briefings, e.g. "Sidewalk robot bill".' }),
      summary: req('text'),
      billType: req('enum', { values: ['lawmaker', 'government', 'committee_alternative'] }),
      stage: req('enum', { values: BILL_STAGES }),
      stageHistory: req('json', { note: '[{stage, date, institutionId?}] in date order; last entry equals stage.' }),
      proposedDate: req('date'),
      mergedInto: opt('ref', { refTypes: ['Bill'], note: 'Set when stage is merged_alternative (대안반영폐기).' }),
    },
  },
  Provision: {
    layer: 'public',
    description: 'A regulatory provision (article of an act) that bills amend and institutions administer.',
    properties: { instrument: req('string'), article: req('string'), title: req('string'), summary: req('text') },
  },
  Institution: {
    layer: 'public',
    description: 'A committee, subcommittee, ministry, agency or the plenary session.',
    properties: {
      name: req('string'),
      nameKo: req('string'),
      kind: req('enum', { values: ['committee', 'subcommittee', 'ministry', 'agency', 'plenary'] }),
      parentId: opt('ref', { refTypes: ['Institution'] }),
    },
  },
  Person: {
    layer: 'public',
    description: 'A lawmaker, official, legislative aide or organization representative.',
    properties: {
      name: req('string'),
      kind: req('enum', { values: ['lawmaker', 'official', 'staffer', 'org_rep'] }),
      party: opt('string', { note: 'Neutral labels: Party A, Party B, Party C.' }),
      district: opt('string'),
      terms: opt('number'),
      title: opt('string'),
      orgId: opt('ref', { refTypes: ['StakeholderOrg'] }),
      aideTo: opt('ref', { refTypes: ['Person'] }),
    },
  },
  StakeholderOrg: {
    layer: 'public',
    description: 'An association, NGO, company, research body or union with a stake in an issue.',
    properties: { name: req('string'), kind: req('enum', { values: ['association', 'ngo', 'company', 'research', 'union'] }) },
  },
  Event: {
    layer: 'public',
    description: 'A meeting, hearing, notice period, seminar, audit session or plenary.',
    properties: {
      name: req('string'),
      kind: req('enum', { values: ['full_committee', 'subcommittee', 'hearing', 'public_comment', 'seminar', 'audit', 'plenary'] }),
      date: req('date', { note: 'For public_comment, the closing date of the notice period.' }),
      startDate: opt('date'),
      institutionId: opt('ref', { refTypes: ['Institution'] }),
      status: req('enum', { values: ['scheduled', 'held'] }),
      outcome: opt('text'),
    },
  },
  Signal: {
    layer: 'public',
    description: 'One collected raw item (bill update, press release, notice, gazette entry, news, minutes, seminar). Triage turns it into links.',
    properties: {
      sourceType: req('enum', { values: SOURCE_TYPES }),
      title: req('string'),
      url: req('string', { note: 'https://example.invalid/... for synthetic records; the official https page for public records.' }),
      sourceName: opt('string', { note: 'The source as shown to readers, e.g. 관보 or 국회 회의록.' }),
      publisher: opt('string', { note: 'Issuing institution, committee or news outlet.' }),
      publishedAt: opt('date'),
      collectedAt: req('datetime'),
      rawText: req('text'),
      status: req('enum', { values: ['new', 'triaged', 'dismissed'], note: 'Set by the collector only. How each client filed the item is a SignalTriage record in that client layer.' }),
      relevance: opt('number', { min: 0, max: 1 }),
      dismissReason: opt('string'),
    },
  },
  Evidence: {
    layer: 'public',
    description: 'The support for one link: source, excerpt, method and confidence.',
    properties: {
      sourceUrl: req('string'),
      sourceType: req('enum', { values: ['official_record', ...SOURCE_TYPES] }),
      signalId: opt('ref', { refTypes: ['Signal'] }),
      excerpt: req('text'),
      method: req('enum', { values: ['rule', 'llm', 'human'], note: 'Set from the acting role. No code path writes llm; the value is reserved.' }),
      confidence: req('number', { min: 0, max: 1 }),
      reviewStatus: req('enum', { values: ['accepted', 'review', 'rejected'], note: 'review = waiting in the human review queue; functions ignore links supported only by review evidence.' }),
    },
  },
  // ---- Client layer (marking CLIENT:<clientId>) ----
  Client: {
    layer: 'client',
    description: 'A client organization.',
    properties: { name: req('string'), sector: req('string') },
  },
  Engagement: {
    layer: 'client',
    description: 'The consulting engagement for one client: scope, team and what is watched.',
    properties: { clientId: req('ref', { refTypes: ['Client'] }), scope: req('text'), team: req('string[]'), startDate: req('date') },
  },
  SignalTriage: {
    layer: 'client',
    description: "One client's filing of a collected item: filed under an issue, set aside, or returned to the queue. The public Signal is never changed, so one client's triage does not touch another client's queue.",
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      signalId: req('ref', { refTypes: ['Signal'] }),
      status: req('enum', { values: ['filed', 'set_aside', 'returned'] }),
      issueId: opt('ref', { refTypes: ['Issue'] }),
      relevance: req('number', { min: 0, max: 1 }),
      reason: opt('string'),
      evidenceIds: opt('ref[]', { refTypes: ['Evidence'], note: 'Evidence this filing created; returning the item rejects only these.' }),
      triagedBy: req('string'),
    },
  },
  ClientPosition: {
    layer: 'client',
    description: "The client's stance on an issue or bill.",
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      targetId: req('ref', { refTypes: ['Issue', 'Bill'] }),
      stance: req('enum', { values: ['support', 'oppose', 'amend', 'monitor'] }),
      rationale: req('text'),
      setBy: req('string'),
      approvedBy: opt('string'),
    },
  },
  Interaction: {
    layer: 'client',
    description: 'A logged meeting or call with a public official, aide or stakeholder.',
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      kind: req('enum', { values: ['meeting', 'call'] }),
      date: req('date'),
      participantIds: req('ref[]', { refTypes: ['Person'] }),
      summary: req('text'),
      targetIds: opt('ref[]', { refTypes: ['Issue', 'Bill'] }),
    },
  },
  Deliverable: {
    layer: 'client',
    description: 'A work product for the client. Sending requires principal approval first.',
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      kind: req('enum', { values: ['weekly_report', 'issue_brief', 'comment_letter', 'meeting_prep'] }),
      title: req('string'),
      status: req('enum', { values: ['draft', 'in_review', 'approved', 'sent'] }),
      body: req('text'),
      sourceIds: opt('ref[]'),
      createdBy: req('string'),
      approvedBy: opt('string'),
      sentAt: opt('datetime'),
    },
  },
  Decision: {
    layer: 'client',
    description: 'A judgment call that needs the principal: question, recommendation and alternatives.',
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      question: req('text'),
      recommendation: req('text'),
      alternatives: req('string[]'),
      status: req('enum', { values: ['open', 'resolved'] }),
      subjectId: opt('ref', { note: 'The bill or issue the decision is about.' }),
      dueDate: opt('date', { note: 'When the principal needs to decide.' }),
      followUp: opt('string', { note: 'The short task title created if the principal approves.' }),
      targetId: opt('ref', { refTypes: ['Person', 'StakeholderOrg'], note: 'The person the recommendation is about.' }),
      premiseStance: opt('enum', { values: STANCES, note: "The target's assessed stance when the decision was raised. A different stance now makes the decision out of date." }),
      openedAt: req('datetime'),
      resolution: opt('enum', { values: ['approve', 'alternative', 'reject', 'withdraw'], note: 'withdraw: the premise changed and the decision no longer applies.' }),
      resolutionNote: opt('text'),
      resolvedBy: opt('string'),
    },
  },
  Task: {
    layer: 'client',
    description: 'A dated follow-up owned by the consulting team (human or agent) or asked of the client.',
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      title: req('string'),
      dueDate: req('date'),
      owner: req('enum', { values: TASK_OWNERS, note: 'client = something the team needs from the client (data, attendees, sign-off).' }),
      status: req('enum', { values: ['open', 'done'] }),
      subjectId: opt('ref'),
    },
  },
  StakeholderAssessment: {
    layer: 'client',
    description: "One client's read of a person or organization on one issue. Kept apart from the public Person and StakeholderOrg records so a client's judgment never enters the shared layer.",
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      subjectId: req('ref', { refTypes: ['Person', 'StakeholderOrg'] }),
      issueId: req('ref', { refTypes: ['Issue'] }),
      stance: req('enum', { values: STANCES, note: 'Anything but unconfirmed needs at least one basis record.' }),
      influence: req('enum', { values: LEVELS }),
      relevance: req('enum', { values: LEVELS }),
      basisIds: opt('ref[]', { refTypes: BASIS_TYPES, note: 'What the stance rests on: a sponsorship, a statement at an event, a news item, a meeting.' }),
      interests: opt('text'),
      assessedBy: req('string'),
      assessedAt: req('date'),
    },
  },
  RiskOpportunity: {
    layer: 'client',
    description: 'A risk or an opportunity for the client, tagged by impact and urgency instead of a score.',
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      kind: req('enum', { values: ['risk', 'opportunity'] }),
      title: req('string'),
      summary: req('text'),
      impact: req('enum', { values: ['high', 'medium'] }),
      urgency: req('enum', { values: URGENCY }),
      dueDate: opt('date'),
      subjectIds: req('ref[]', { refTypes: ['Bill', 'Issue', 'Event'] }),
      addedBy: req('string'),
      approvedBy: opt('string'),
    },
  },
  Strategy: {
    layer: 'client',
    description: 'The plan for one issue: desired outcome, messages, who to persuade, allies and dated steps.',
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      issueId: req('ref', { refTypes: ['Issue'] }),
      desiredOutcome: req('text'),
      messages: req('string[]'),
      targetIds: req('ref[]', { refTypes: ['StakeholderAssessment'] }),
      allyIds: opt('ref[]', { refTypes: ['StakeholderOrg'] }),
      planTaskIds: opt('ref[]', { refTypes: ['Task'] }),
      updatedBy: req('string'),
      approvedBy: opt('string'),
    },
  },
  MonitoringProfile: {
    layer: 'client',
    description: 'What one client wants watched: objectives, keywords, committees, agencies and source types. The collector reads it as its watch list.',
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      objectives: req('json', { note: '[{text, priority 1-3}], 1 = most important.' }),
      keywords: req('json', { note: '[{term, priority high/medium/low, synonyms?, exclude?}]. A term hits on itself or a synonym unless one of its exclude phrases is also in the text.' }),
      committees: req('ref[]', { refTypes: ['Institution'] }),
      agencies: req('ref[]', { refTypes: ['Institution'] }),
      sources: opt('string[]', { note: 'Enabled source types; omitted = all.' }),
      updatedBy: req('string'),
      approvedBy: opt('string'),
    },
  },
  PilotEvaluation: {
    layer: 'client',
    description: "A trial run for one client: the items the client says must be caught, what the system caught in the same window, the client's relevance calls, and the pass criteria.",
    properties: {
      clientId: req('ref', { refTypes: ['Client'] }),
      title: req('string'),
      from: req('date'),
      to: req('date'),
      status: req('enum', { values: ['open', 'closed'] }),
      criteria: req('json', { note: '{access 0-1, officialMisses, noise 0-1}. Defaults: access 1, officialMisses 0, noise 0.2.' }),
      expected: req('json', { note: '[{id, title, url?, date, sourceType}]: what the client lists as must-catch. Matched to a caught item by url, else by title.' }),
      caught: req('json', { note: "[{signalId, relevance?}]: items in the window that hit the profile when the trial started; relevance is the client's call." }),
      startedBy: req('string'),
      closedBy: opt('string'),
      result: opt('enum', { values: ['pass', 'fail'], note: 'Set when the trial closes.' }),
    },
  },
} as const satisfies Record<string, ObjectTypeDef>;
export type ObjectTypeName = keyof typeof objectTypes;
export const OBJECT_TYPE_NAMES = Object.keys(objectTypes) as ObjectTypeName[];

// ---- Link types ----
// cardinality reads from -> to. one-to-many: each target has at most one incoming link of this type.
// many-to-one: each source has at most one outgoing link. requiredFrom/requiredTo: every object of
// that type must take part in at least one link of this type.
export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

export interface LinkTypeDef {
  description: string;
  from: readonly string[];
  to: readonly string[];
  cardinality: Cardinality;
  layer: Layer;
  evidenceRequired: boolean;
  requiredFrom?: readonly string[];
  requiredTo?: readonly string[];
  props?: Record<string, PropertyDef>;
}

export const linkTypes = {
  sponsors: {
    description: 'Lead sponsor: a lawmaker, the government (ministry) or the committee (for alternatives).',
    from: ['Person', 'Institution'], to: ['Bill'], cardinality: 'one-to-many', layer: 'public', evidenceRequired: true, requiredTo: ['Bill'],
  },
  cosponsors: {
    description: 'Cosponsoring lawmaker.',
    from: ['Person'], to: ['Bill'], cardinality: 'many-to-many', layer: 'public', evidenceRequired: true,
  },
  member_of: {
    description: 'Membership with role and period.',
    from: ['Person'], to: ['Institution'], cardinality: 'many-to-many', layer: 'public', evidenceRequired: true,
    props: { role: req('enum', { values: ['chair', 'secretary', 'member', 'official', 'staff'] }), since: req('date'), until: opt('date') },
  },
  referred_to: {
    description: 'The standing committee the bill is currently referred to.',
    from: ['Bill'], to: ['Institution'], cardinality: 'many-to-one', layer: 'public', evidenceRequired: true,
  },
  amends: {
    description: 'The provisions a bill would change.',
    from: ['Bill'], to: ['Provision'], cardinality: 'many-to-many', layer: 'public', evidenceRequired: true,
  },
  about: {
    description: 'Topic of a bill, event or signal.',
    from: ['Bill', 'Event', 'Signal'], to: ['Issue'], cardinality: 'many-to-many', layer: 'public', evidenceRequired: true, requiredFrom: ['Bill'],
  },
  agenda_item: {
    description: 'A bill on the agenda of an event.',
    from: ['Event'], to: ['Bill'], cardinality: 'many-to-many', layer: 'public', evidenceRequired: true,
  },
  testifies_at: {
    description: 'A person or organization speaking at an event.',
    from: ['Person', 'StakeholderOrg'], to: ['Event'], cardinality: 'many-to-many', layer: 'public', evidenceRequired: true,
  },
  regulates: {
    description: 'The institution that administers a provision.',
    from: ['Institution'], to: ['Provision'], cardinality: 'many-to-many', layer: 'public', evidenceRequired: true,
  },
  mentions: {
    description: 'An entity named in a signal.',
    from: ['Signal'], to: ['Bill', 'Person', 'Institution', 'StakeholderOrg'], cardinality: 'many-to-many', layer: 'public', evidenceRequired: true,
  },
  affects: {
    description: 'How strongly an issue touches a client (a client-layer judgment, so no public evidence).',
    from: ['Issue'], to: ['Client'], cardinality: 'many-to-many', layer: 'client', evidenceRequired: false,
    props: { impact: req('enum', { values: ['high', 'medium', 'low'] }) },
  },
  watches: {
    description: 'What an engagement tracks.',
    from: ['Engagement'], to: ['Issue', 'Bill'], cardinality: 'many-to-many', layer: 'client', evidenceRequired: false,
  },
  produced_for: {
    description: 'The engagement a deliverable belongs to.',
    from: ['Deliverable'], to: ['Engagement'], cardinality: 'many-to-one', layer: 'client', evidenceRequired: false, requiredFrom: ['Deliverable'],
  },
  raised_by: {
    description: 'What prompted a decision.',
    from: ['Decision'], to: ['Task', 'Deliverable', 'Signal'], cardinality: 'many-to-one', layer: 'client', evidenceRequired: false, requiredFrom: ['Decision'],
  },
} as const satisfies Record<string, LinkTypeDef>;
export type LinkTypeName = keyof typeof linkTypes;
export const LINK_TYPE_NAMES = Object.keys(linkTypes) as LinkTypeName[];
const EVIDENCED_LINKS = LINK_TYPE_NAMES.filter((n) => linkTypes[n].evidenceRequired);

// ---- Action types ----
// Actions are the only way to change state. Each declares who may run it, whether the
// principal must approve first, what must already be true, and what it writes.
export interface Precondition {
  param: string;
  field: string;
  in: readonly string[];
  message: string;
}

export interface ActionTypeDef {
  description: string;
  params: Record<string, PropertyDef>;
  allowedRoles: readonly Role[];
  requiresApproval: boolean;
  approverRole?: Role;
  preconditions?: readonly Precondition[];
  constraints?: readonly string[]; // checked in the effect; listed here for the docs
  sideEffects: readonly string[];
}

const ANY_USER: readonly Role[] = ['agent', 'consultant', 'principal'];
const HUMANS: readonly Role[] = ['consultant', 'principal'];

export const actionTypes = {
  triageSignal: {
    description: 'File a new Signal for one client under an Issue and/or Bill with a relevance score, or set it aside for that client.',
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      signalId: req('ref', { refTypes: ['Signal'] }),
      issueId: opt('ref', { refTypes: ['Issue'] }),
      billId: opt('ref', { refTypes: ['Bill'] }),
      mentionIds: opt('ref[]', { refTypes: ['Person', 'Institution', 'StakeholderOrg'] }),
      relevance: req('number', { min: 0, max: 1 }),
      confidence: opt('number', { min: 0, max: 1, note: 'Defaults to relevance.' }),
      excerpt: opt('text'),
      dismiss: opt('boolean'),
      reason: opt('string'),
    },
    allowedRoles: ANY_USER, requiresApproval: false,
    constraints: ['Unless dismiss is true, issueId or billId is required.', 'The client must not have filed or set aside this Signal already.'],
    sideEffects: ['Creates or updates the SignalTriage for this client and signal (CLIENT marking); the Signal itself is unchanged', 'Creates about / mentions links, each with an Evidence record (method rule for agent, human for consultant or principal)', 'Agent evidence below 0.8 confidence lands in the review queue'],
  },
  linkEvidence: {
    description: 'Create a public-layer link (if absent) and attach one Evidence record to it.',
    params: {
      linkType: req('enum', { values: EVIDENCED_LINKS }),
      from: req('ref'),
      to: req('ref'),
      excerpt: req('text'),
      signalId: opt('ref', { refTypes: ['Signal'] }),
      confidence: req('number', { min: 0, max: 1 }),
    },
    allowedRoles: ANY_USER, requiresApproval: false,
    constraints: ['from and to must be object types the link type allows.', 'Evidence.method is set from the caller role (agent or system = rule, human roles = human); callers cannot choose it.'],
    sideEffects: ['Creates the link and an Evidence record', 'Agent evidence below 0.8 confidence: Evidence.reviewStatus = review'],
  },
  reopenSignal: {
    description: "Undo a client's triage: return a filed or set-aside Signal to that client's queue.",
    params: { clientId: req('ref', { refTypes: ['Client'] }), signalId: req('ref', { refTypes: ['Signal'] }) },
    allowedRoles: HUMANS, requiresApproval: false,
    constraints: ['The client must have filed or set aside this Signal.'],
    sideEffects: ['SignalTriage.status = returned', 'Evidence that filing created is marked rejected', 'Links left without other support are removed'],
  },
  reviewEvidence: {
    description: 'Accept or reject Evidence waiting in the review queue.',
    params: { evidenceId: req('ref', { refTypes: ['Evidence'] }), verdict: req('enum', { values: ['accept', 'reject'] }) },
    allowedRoles: HUMANS, requiresApproval: false,
    preconditions: [{ param: 'evidenceId', field: 'reviewStatus', in: ['review'], message: 'Evidence is not in the review queue' }],
    sideEffects: ['Evidence.reviewStatus updated', 'Reject removes a link left without any non-rejected Evidence'],
  },
  updateBillStage: {
    description: 'Record a stage change collected from the official bill tracker.',
    params: {
      billId: req('ref', { refTypes: ['Bill'] }),
      stage: req('enum', { values: BILL_STAGES }),
      date: req('date'),
      institutionId: opt('ref', { refTypes: ['Institution'] }),
      mergedInto: opt('ref', { refTypes: ['Bill'] }),
      billNo: opt('string', { note: 'The number the Assembly assigns on submission.' }),
    },
    allowedRoles: ['system'], requiresApproval: false,
    constraints: ['Stage must move forward along the lifecycle (or to a terminal stage).', 'A bill that is passed, merged_alternative or withdrawn cannot change stage.', 'date must not precede the last history entry.', 'merged_alternative requires mergedInto.', 'Leaving legislative notice requires a billNo if the bill has none.'],
    sideEffects: ['Appends to Bill.stageHistory and updates Bill.stage'],
  },
  setClientPosition: {
    description: "Set or replace the client's stance on an issue or bill.",
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      targetId: req('ref', { refTypes: ['Issue', 'Bill'] }),
      stance: req('enum', { values: ['support', 'oppose', 'amend', 'monitor'] }),
      rationale: req('text'),
    },
    allowedRoles: HUMANS, requiresApproval: true, approverRole: 'principal',
    sideEffects: ['Creates or replaces the ClientPosition (CLIENT marking)', 'Consultant requests wait for principal approval'],
  },
  logInteraction: {
    description: 'Log a meeting or call with an official, aide or stakeholder.',
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      kind: req('enum', { values: ['meeting', 'call'] }),
      date: req('date'),
      participantIds: req('ref[]', { refTypes: ['Person'] }),
      summary: req('text'),
      targetIds: opt('ref[]', { refTypes: ['Issue', 'Bill'] }),
    },
    allowedRoles: HUMANS, requiresApproval: false,
    sideEffects: ['Creates an Interaction (CLIENT marking)'],
  },
  draftDeliverable: {
    description: 'Create a draft deliverable. Agents may draft but never go beyond review.',
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      kind: req('enum', { values: ['weekly_report', 'issue_brief', 'comment_letter', 'meeting_prep'] }),
      title: req('string'),
      body: req('text'),
      sourceIds: opt('ref[]'),
    },
    allowedRoles: ANY_USER, requiresApproval: false,
    constraints: ['The client must have an Engagement.'],
    sideEffects: ['Creates a Deliverable (status draft) and a produced_for link'],
  },
  submitForReview: {
    description: 'Move a draft into review.',
    params: { deliverableId: req('ref', { refTypes: ['Deliverable'] }) },
    allowedRoles: ANY_USER, requiresApproval: false,
    preconditions: [{ param: 'deliverableId', field: 'status', in: ['draft'], message: 'Only drafts can be submitted' }],
    sideEffects: ['Deliverable.status = in_review'],
  },
  redraftDeliverable: {
    description: 'Replace the text of a deliverable that has not been sent, for example when the weekly report is rebuilt from current data.',
    params: { deliverableId: req('ref', { refTypes: ['Deliverable'] }), body: req('text'), sourceIds: opt('ref[]') },
    allowedRoles: ANY_USER, requiresApproval: false,
    preconditions: [{ param: 'deliverableId', field: 'status', in: ['draft', 'in_review', 'approved'], message: 'A sent deliverable cannot change' }],
    sideEffects: ['Deliverable.body and sourceIds replaced', 'An approved deliverable goes back to in_review and its approval is cleared'],
  },
  approveDeliverable: {
    description: 'Principal approves a deliverable that is in review.',
    params: { deliverableId: req('ref', { refTypes: ['Deliverable'] }) },
    allowedRoles: ['principal'], requiresApproval: false,
    preconditions: [{ param: 'deliverableId', field: 'status', in: ['in_review'], message: 'Only deliverables in review can be approved' }],
    sideEffects: ['Deliverable.status = approved, approvedBy recorded'],
  },
  sendDeliverable: {
    description: 'Send an approved deliverable to the client (simulated; nothing leaves the browser).',
    params: { deliverableId: req('ref', { refTypes: ['Deliverable'] }) },
    allowedRoles: HUMANS, requiresApproval: false,
    preconditions: [{ param: 'deliverableId', field: 'status', in: ['approved'], message: 'Blocked until the principal approves the deliverable' }],
    sideEffects: ['Deliverable.status = sent, sentAt set', 'Audit entry carries the approver recorded on the deliverable'],
  },
  raiseDecision: {
    description: 'Put a judgment call in front of the principal with a recommendation.',
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      question: req('text'),
      recommendation: req('text'),
      alternatives: req('string[]'),
      raisedById: req('ref', { refTypes: ['Task', 'Deliverable', 'Signal'] }),
      subjectId: opt('ref'),
      dueDate: opt('date'),
      followUp: opt('string'),
      targetId: opt('ref', { refTypes: ['Person', 'StakeholderOrg'] }),
      premiseStance: opt('enum', { values: STANCES }),
    },
    allowedRoles: ANY_USER, requiresApproval: false,
    sideEffects: ['Creates a Decision (status open) and a raised_by link'],
  },
  resolveDecision: {
    description: 'Principal decides.',
    params: {
      decisionId: req('ref', { refTypes: ['Decision'] }),
      resolution: req('enum', { values: ['approve', 'alternative', 'reject', 'withdraw'] }),
      note: opt('text'),
    },
    allowedRoles: ['principal'], requiresApproval: false,
    preconditions: [{ param: 'decisionId', field: 'status', in: ['open'], message: 'Decision is already resolved' }],
    sideEffects: ['Decision.status = resolved', 'approve creates a follow-up Task for a human, titled with the decision followUp, due in 3 days or by the decision due date, whichever is earlier'],
  },
  createTask: {
    description: 'Create a dated follow-up.',
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      title: req('string'),
      dueDate: req('date'),
      owner: req('enum', { values: TASK_OWNERS }),
      subjectId: opt('ref'),
    },
    allowedRoles: ANY_USER, requiresApproval: false,
    sideEffects: ['Creates a Task (status open)'],
  },
  completeTask: {
    description: 'Mark a task done.',
    params: { taskId: req('ref', { refTypes: ['Task'] }) },
    allowedRoles: HUMANS, requiresApproval: false,
    preconditions: [{ param: 'taskId', field: 'status', in: ['open'], message: 'Task is already done' }],
    sideEffects: ['Task.status = done'],
  },
  assessStakeholder: {
    description: "Record the client's read of a person or organization on an issue: stance, influence, relevance and what the stance rests on.",
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      subjectId: req('ref', { refTypes: ['Person', 'StakeholderOrg'] }),
      issueId: req('ref', { refTypes: ['Issue'] }),
      stance: req('enum', { values: STANCES }),
      influence: req('enum', { values: LEVELS }),
      relevance: req('enum', { values: LEVELS }),
      basisIds: opt('ref[]', { refTypes: BASIS_TYPES }),
      interests: opt('text'),
    },
    allowedRoles: HUMANS, requiresApproval: false,
    constraints: ['A stance other than unconfirmed needs at least one basis record.', 'Humans only: the agent may not judge a person.'],
    sideEffects: ['Creates or replaces the StakeholderAssessment for this client, subject and issue (CLIENT marking)'],
  },
  addRiskOpportunity: {
    description: 'Add a risk or an opportunity to the client view.',
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      kind: req('enum', { values: ['risk', 'opportunity'] }),
      title: req('string'),
      summary: req('text'),
      impact: req('enum', { values: ['high', 'medium'] }),
      urgency: req('enum', { values: URGENCY }),
      dueDate: opt('date'),
      subjectIds: req('ref[]', { refTypes: ['Bill', 'Issue', 'Event'] }),
    },
    allowedRoles: ANY_USER, requiresApproval: true, approverRole: 'principal',
    constraints: ['subjectIds must name at least one bill, issue or event.'],
    sideEffects: ['Creates a RiskOpportunity (CLIENT marking)', 'Agent and consultant additions wait for principal approval'],
  },
  updateStrategy: {
    description: 'Create or revise the strategy for one issue.',
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      issueId: req('ref', { refTypes: ['Issue'] }),
      desiredOutcome: opt('text'),
      messages: opt('string[]'),
      targetIds: opt('ref[]', { refTypes: ['StakeholderAssessment'] }),
      allyIds: opt('ref[]', { refTypes: ['StakeholderOrg'] }),
      planTaskIds: opt('ref[]', { refTypes: ['Task'] }),
    },
    allowedRoles: HUMANS, requiresApproval: true, approverRole: 'principal',
    constraints: ['A new strategy needs desiredOutcome and messages.', 'Targets must be assessments on the same issue.'],
    sideEffects: ['Creates or updates the Strategy for this client and issue (CLIENT marking)', 'Consultant changes wait for principal approval'],
  },
  updateMonitoringProfile: {
    description: "Create or revise the client's monitoring profile: objectives, keywords, committees, agencies and source types.",
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      objectives: opt('json'),
      keywords: opt('json'),
      committees: opt('ref[]', { refTypes: ['Institution'] }),
      agencies: opt('ref[]', { refTypes: ['Institution'] }),
      sources: opt('string[]'),
    },
    allowedRoles: HUMANS, requiresApproval: true, approverRole: 'principal',
    constraints: ['Objectives need text and priority 1-3; keywords need a term and priority high, medium or low.', 'committees must be committees or subcommittees; agencies must be ministries or agencies.', 'sources must be known source types.', 'A new profile needs objectives and keywords.'],
    sideEffects: ['Creates or updates the MonitoringProfile for this client (CLIENT marking)', 'Consultant changes wait for principal approval'],
  },
  startPilot: {
    description: 'Start a trial: fix the window and record every item in it that hits the client profile.',
    params: {
      clientId: req('ref', { refTypes: ['Client'] }),
      title: req('string'),
      from: req('date'),
      to: req('date'),
      criteria: opt('json'),
    },
    allowedRoles: HUMANS, requiresApproval: false,
    constraints: ['The client needs a monitoring profile and no other open trial.', 'from must not be after to, and to must not be after the base date.'],
    sideEffects: ['Creates a PilotEvaluation (status open, CLIENT marking) with the caught items'],
  },
  setPilotCriteria: {
    description: 'Change the pass criteria of an open trial.',
    params: { pilotId: req('ref', { refTypes: ['PilotEvaluation'] }), access: opt('number', { min: 0, max: 1 }), officialMisses: opt('number', { min: 0 }), noise: opt('number', { min: 0, max: 1 }) },
    allowedRoles: HUMANS, requiresApproval: false,
    preconditions: [{ param: 'pilotId', field: 'status', in: ['open'], message: 'The trial is closed' }],
    sideEffects: ['PilotEvaluation.criteria updated'],
  },
  addExpectedItem: {
    description: 'Add an item the client says the system must catch.',
    params: {
      pilotId: req('ref', { refTypes: ['PilotEvaluation'] }),
      title: req('string'),
      url: opt('string'),
      date: req('date', { note: 'Publication date.' }),
      sourceType: req('enum', { values: SOURCE_TYPES }),
    },
    allowedRoles: HUMANS, requiresApproval: false,
    preconditions: [{ param: 'pilotId', field: 'status', in: ['open'], message: 'The trial is closed' }],
    constraints: ['date must fall inside the trial window.'],
    sideEffects: ['Appends to PilotEvaluation.expected'],
  },
  markRelevance: {
    description: "Record the client's call on a caught item: relevant or irrelevant.",
    params: { pilotId: req('ref', { refTypes: ['PilotEvaluation'] }), signalId: req('ref', { refTypes: ['Signal'] }), relevance: req('enum', { values: ['relevant', 'irrelevant'] }) },
    allowedRoles: HUMANS, requiresApproval: false,
    preconditions: [{ param: 'pilotId', field: 'status', in: ['open'], message: 'The trial is closed' }],
    constraints: ['signalId must be one of the caught items.'],
    sideEffects: ['Sets the relevance of that caught item'],
  },
  closePilot: {
    description: 'Close a trial and record pass or fail against its criteria.',
    params: { pilotId: req('ref', { refTypes: ['PilotEvaluation'] }) },
    allowedRoles: HUMANS, requiresApproval: false,
    preconditions: [{ param: 'pilotId', field: 'status', in: ['open'], message: 'The trial is already closed' }],
    sideEffects: ['PilotEvaluation.status = closed, result = pass or fail from pilotMetrics'],
  },
} as const satisfies Record<string, ActionTypeDef>;
export type ActionName = keyof typeof actionTypes;
export const ACTION_NAMES = Object.keys(actionTypes) as ActionName[];

// ---- Functions (implemented in functions.ts, all deterministic) ----
export const functionTypes = [
  { name: 'whatChanged', signature: 'whatChanged(view, since, until?)', description: 'Stage changes, new signals, events held and upcoming, and risk movements after the since date.' },
  { name: 'billRiskScore', signature: 'billRiskScore(view, billId, clientId, asOf?)', description: 'Weighted 0-100 score for one bill and one client, returned with every component.' },
  { name: 'responseLevel', signature: 'responseLevel(view, billId, clientId, since?)', description: 'One of act_now, engage, monitor or watch for one bill and one client, from explicit rules (stage moved this week, next meeting or closing notice period within 7 or 30 days, client stance, issue impact), with the reasons that raise the level and those that keep it from going higher. An opposed, high-impact bill on an agenda within 7 days is act_now even if it did not move.' },
  { name: 'keyPeople', signature: 'keyPeople(view, billId, limit?)', description: 'Ranked people around a bill, each with the reasons for the rank.' },
  { name: 'upcomingDeadlines', signature: 'upcomingDeadlines(view, clientId, days?)', description: 'Open tasks and scheduled events for the client in the next N days.' },
  { name: 'issueExposure', signature: 'issueExposure(view, clientId)', description: 'Issues ranked by how much active legislative risk sits on them for the client.' },
  { name: 'stageGates', signature: 'stageGates(view, billId)', description: 'Who decides at each stage (bill review subcommittee, full committee, Legislation and Judiciary Committee, plenary): date, status, and the chairs and secretaries who control each agenda.' },
  { name: 'profileMatch', signature: 'profileMatch(profile, text)', description: 'Which profile keywords hit a text (the term or a synonym, case-insensitive), which were suppressed by an exclude phrase, and a 0-1 score: hits combine as 1 - prod(1 - w) with w = 0.6 high, 0.45 medium, 0.3 low.' },
  { name: 'pilotMetrics', signature: 'pilotMetrics(view, pilotId, reach?)', description: 'Trial results: sources reached (from the fetch results of a live collector run when supplied), missed items (and how many came from the Assembly or government), noise among judged items, median days from publication to detection, pass or fail on each criterion, and the same counts per source type.' },
  { name: 'stakeholderNetwork', signature: 'stakeholderNetwork(view, clientId, issueId)', description: "The client's assessed stakeholders on one issue and the public relations between them (cosponsorship, same committee, joint event), each edge with the records it rests on." },
] as const;

export const markingTypes = [
  { name: 'PUBLIC', description: 'Public legislative record. Visible to every caller.' },
  { name: 'CLIENT:<clientId>', description: "One client's layer. Visible only to callers assigned to that client, and sent to a model provider only if it is allow-listed." },
] as const;
