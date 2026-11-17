// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Every connector in this edition, in report order. Official Assembly API connectors need ASSEMBLY_API_KEY.
// Some government site connectors are kept in a private edition.
import { assemblyBills } from './assembly-bills.ts';
import { assemblyBillStages } from './assembly-bill-stages.ts';
import { assemblyMinutes } from './assembly-minutes.ts';
import { assemblySeminars } from './assembly-seminars.ts';
import { assemblyCommitteePress } from './assembly-committee-press.ts';
import { googleNews } from './google-news.ts';
import type { Connector } from '../core/types.ts';

export const CONNECTORS: Connector[] = [
  assemblyBills, assemblyBillStages, assemblyMinutes, assemblySeminars, assemblyCommitteePress, googleNews,
];
