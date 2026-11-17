// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// npm run ingest -- --from 2026-11-04 --to 2026-11-17 --profile ingest/profiles/aster-robotics.json [--out file]
// Prints one row per source and writes the kept items plus their Signal/Evidence records as JSON.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { CONNECTORS } from './connectors/index.ts';
import { runIngest } from './core/runner.ts';
import { toOntology } from './map.ts';
import type { MonitoringProfile } from './core/types.ts';

const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' }, profile: { type: 'string' }, out: { type: 'string' } } });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
if (!values.from || !values.to || !values.profile || !DATE.test(values.from) || !DATE.test(values.to) || values.from > values.to) {
  console.error('Usage: npm run ingest -- --from YYYY-MM-DD --to YYYY-MM-DD --profile ingest/profiles/<name>.json [--out <file>]');
  process.exit(2);
}
const profile: MonitoringProfile = JSON.parse(readFileSync(values.profile, 'utf8'));
const out = values.out ?? `ingest/out/${profile.clientId}_${values.from}_${values.to}.json`;

const { items, perSource } = await runIngest({ from: values.from, to: values.to }, profile, CONNECTORS);

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(`${profile.clientId}  ${values.from} ~ ${values.to}\n`);
console.log(`${pad('source', 30)}${pad('ok', 5)}${pad('fetched', 9)}${pad('kept', 6)}error`);
for (const s of perSource) console.log(`${pad(s.sourceId, 30)}${pad(s.ok ? 'yes' : 'NO', 5)}${pad(s.count, 9)}${pad(s.kept, 6)}${s.error ?? ''}`);
console.log(`\n${items.length} items after merging duplicates -> ${out}`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ clientId: profile.clientId, from: values.from, to: values.to, perSource, items, objects: toOntology(items) }, null, 1)}\n`);
