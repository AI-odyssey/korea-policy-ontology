// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// World validator: schema shape, cardinality, evidence, synthetic flags, and marking isolation.
import { linkTypes, objectTypes } from './schema.ts';
import type { LinkTypeDef, ObjectTypeDef } from './schema.ts';
import { checkProps } from './props.ts';
import { clientMarking } from './markings.ts';
import type { World } from './runtime.ts';
import { BILL_STAGES } from './schema.ts';
import { profileErrors } from './functions.ts';

const BASE_KEYS = ['id', 'type', 'markings', 'synthetic', 'provenance'];
const PUBLIC_RECORD_TYPES = ['Signal', 'Evidence'];
const officialUrl = (u: unknown) => typeof u === 'string' && /^https:\/\/[^/]+\.[^/]+/.test(u) && !u.startsWith('https://example.invalid/');

export function validateWorld(world: World): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  const byId = new Map(world.objects.map((o) => [o.id, o]));
  if (byId.size !== world.objects.length) err('duplicate object ids');
  const typeOf = (id: string) => byId.get(id)?.type;
  const clientEvidenceUsed = new Set<string>();
  if (world.meta.synthetic !== true) err('meta.synthetic must be true'); // the fictional world; public records ride alongside it

  // The client a record belongs to, derived from its markings (undefined = PUBLIC).
  const clientOfMarkings = (ms: readonly string[]) => ms.find((m) => m.startsWith('CLIENT:'))?.slice(7);

  for (const o of world.objects) {
    const where = `${o.id}`;
    const def = Object.hasOwn(objectTypes, o.type) ? (objectTypes as Record<string, ObjectTypeDef>)[o.type] : undefined;
    if (!def) { err(`${where}: unknown object type ${o.type}`); continue; }
    // Real public records are allowed only as Signal and Evidence; people, clients and the client layer stay synthetic.
    const isPublic = o.provenance === 'public';
    if (o.provenance !== undefined && o.provenance !== 'synthetic' && !isPublic) err(`${where}: unknown provenance ${o.provenance}`);
    if (isPublic && !PUBLIC_RECORD_TYPES.includes(o.type)) err(`${where}: only Signal and Evidence may be public records`);
    if (isPublic && o.synthetic !== false) err(`${where}: a public record must have synthetic false`);
    if (!isPublic && o.synthetic !== true) err(`${where}: synthetic must be true`);
    // Evidence may carry one client marking when it backs that client's link (a client's filing); linkage is checked with the links below.
    const clientEvidence = o.type === 'Evidence' && o.markings?.length === 1 && o.markings[0].startsWith('CLIENT:');
    const expected = def.layer === 'public' ? ['PUBLIC'] : [clientMarking(o.type === 'Client' ? o.id : o.clientId)];
    if (!clientEvidence && JSON.stringify(o.markings) !== JSON.stringify(expected)) err(`${where}: markings should be ${expected.join(',')}, got ${o.markings?.join(',')}`);
    const props = Object.fromEntries(Object.entries(o).filter(([k]) => !BASE_KEYS.includes(k)));
    // A public Signal may carry titleEn, the hand-written English title the demo shows above the Korean one.
    const extra = isPublic && o.type === 'Signal' ? ['titleEn'] : [];
    for (const e of checkProps(def.properties, props, typeOf, extra)) err(`${where}.${e}`);
    if (extra.length && o.titleEn !== undefined && (typeof o.titleEn !== 'string' || !o.titleEn.trim())) err(`${where}.titleEn: must be a non-empty string`);

    // Reference isolation: public objects never point at client objects; client objects only at their own client.
    const owner = clientOfMarkings(o.markings ?? []);
    for (const [k, d] of Object.entries(def.properties)) {
      if (d.type !== 'ref' && d.type !== 'ref[]') continue;
      for (const id of ([] as string[]).concat(o[k] ?? [])) {
        const target = byId.get(id);
        const targetOwner = target && clientOfMarkings(target.markings);
        if (targetOwner && !owner) err(`${where}.${k}: PUBLIC object references CLIENT object ${id}`);
        else if (targetOwner && targetOwner !== owner) err(`${where}.${k}: cross-client reference to ${id}`);
      }
    }
    if (o.type === 'Bill') checkBill(o, err);
    if (o.type === 'StakeholderAssessment' && o.stance !== 'unconfirmed' && !o.basisIds?.length) err(`${where}: stance ${o.stance} without a basis record`);
    if (o.type === 'Strategy') for (const t of o.targetIds ?? []) if (byId.get(t) && byId.get(t)!.issueId !== o.issueId) err(`${where}: target ${t} is on another issue`);
    if (o.type === 'MonitoringProfile') for (const e of profileErrors(o)) err(`${where}.${e}`);
    if (o.type === 'PilotEvaluation') for (const c of o.caught ?? []) if (typeOf(c.signalId) !== 'Signal') err(`${where}: caught item ${c.signalId} is not a Signal`);
    if (o.type === 'Signal' && !isPublic && !String(o.url).startsWith('https://example.invalid/')) err(`${where}: url must be on example.invalid`);
    if (isPublic && !officialUrl(o.type === 'Signal' ? o.url : o.sourceUrl)) err(`${where}: a public record needs its official https url`);
  }

  // Links
  const out = new Map<string, number>();
  const inn = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const seen = new Set<string>();
  for (const l of world.links) {
    const where = `link ${l.id} (${l.type})`;
    const def = Object.hasOwn(linkTypes, l.type) ? (linkTypes as Record<string, LinkTypeDef>)[l.type] : undefined;
    if (!def) { err(`${where}: unknown link type`); continue; }
    if (l.synthetic !== true) err(`${where}: synthetic must be true`);
    const key = `${l.type}|${l.from}|${l.to}|${clientOfMarkings(l.markings) ?? ""}`; // each client may file the same link for itself
    if (seen.has(key)) err(`${where}: duplicate link`);
    seen.add(key);
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b) { err(`${where}: dangling endpoint`); continue; }
    if (!def.from.includes(a.type) || !def.to.includes(b.type)) err(`${where}: ${a.type} -> ${b.type} not allowed`);
    for (const e of checkProps(def.props ?? {}, l.props ?? {}, typeOf)) err(`${where}.${e}`);

    // Markings: a public-layer link between public objects is PUBLIC; anything touching a client is that client's.
    const owners = new Set([clientOfMarkings(a.markings), clientOfMarkings(b.markings)].filter(Boolean));
    if (owners.size > 1) err(`${where}: connects two different clients`);
    const linkOwner = clientOfMarkings(l.markings);
    // A link between public objects may carry one client marking when all its evidence carries the same marking (a client's filing).
    const evMarks = l.evidence.map((id) => clientOfMarkings(byId.get(id)?.markings ?? []));
    if (def.layer === 'public' && owners.size) err(`${where}: PUBLIC link references a CLIENT object`);
    else if (def.layer === 'public' && linkOwner && (!evMarks.length || evMarks.some((m) => m !== linkOwner))) err(`${where}: a client-marked link needs evidence with the same marking`);
    if (def.layer === 'public' && !linkOwner && evMarks.some(Boolean)) err(`${where}: PUBLIC link rests on client-marked evidence`);
    if (def.layer === 'public' && linkOwner) for (const id of l.evidence) clientEvidenceUsed.add(id);
    if (def.layer === 'client' && !linkOwner) err(`${where}: client-layer link needs a CLIENT marking`);
    if (linkOwner && owners.size && !owners.has(linkOwner)) err(`${where}: marking CLIENT:${linkOwner} does not match its endpoints`);

    if (def.evidenceRequired && l.evidence.length < 1) err(`${where}: needs at least one Evidence`);
    for (const id of l.evidence) if (typeOf(id) !== 'Evidence') err(`${where}: evidence ${id} is not an Evidence object`);
    bump(out, `${l.type}|${l.from}`);
    bump(inn, `${l.type}|${l.to}`);
    if ((def.cardinality === 'many-to-one' || def.cardinality === 'one-to-one') && out.get(`${l.type}|${l.from}`)! > 1) err(`${where}: ${l.from} has more than one outgoing ${l.type}`);
    if ((def.cardinality === 'one-to-many' || def.cardinality === 'one-to-one') && inn.get(`${l.type}|${l.to}`)! > 1) err(`${where}: ${l.to} has more than one incoming ${l.type}`);
  }

  for (const o of world.objects) if (o.type === 'Evidence' && clientOfMarkings(o.markings ?? []) && !clientEvidenceUsed.has(o.id)) err(`${o.id}: client-marked evidence must back a link with the same marking`);

  // Required participation
  for (const [name, def] of Object.entries(linkTypes) as [string, LinkTypeDef][]) {
    for (const o of world.objects) {
      if (def.requiredFrom?.includes(o.type) && !out.get(`${name}|${o.id}`)) err(`${o.id}: needs at least one outgoing ${name}`);
      if (def.requiredTo?.includes(o.type) && !inn.get(`${name}|${o.id}`)) err(`${o.id}: needs at least one incoming ${name}`);
    }
  }
  return errors;
}

function checkBill(b: any, err: (m: string) => void) {
  const h: { stage: string; date: string }[] = b.stageHistory ?? [];
  if (!h.length) return err(`${b.id}: empty stageHistory`);
  if (h[h.length - 1].stage !== b.stage) err(`${b.id}: stage does not match last stageHistory entry`);
  if (h.some((x) => !(BILL_STAGES as readonly string[]).includes(x.stage))) err(`${b.id}: unknown stage in history`);
  for (let i = 1; i < h.length; i++) if (h[i].date < h[i - 1].date) err(`${b.id}: stageHistory is not in date order`);
  if (b.stage === 'merged_alternative' && !b.mergedInto) err(`${b.id}: merged_alternative without mergedInto`);
}

// CLI: `npm run validate`. node:fs is imported lazily so this module stays safe to bundle for the browser.
if (import.meta.main) {
  const { existsSync, readFileSync } = await import('node:fs');
  const world: World = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
  // The live snapshot's public records are checked alongside the fictional world they sit next to in the demo.
  const snapUrl = new URL('../data/live-snapshot.json', import.meta.url);
  const live = existsSync(snapUrl) ? JSON.parse(readFileSync(snapUrl, 'utf8')).signals : [];
  const errors = validateWorld({ ...world, objects: [...world.objects, ...live] });
  if (errors.length) {
    console.error(`${errors.length} validation error(s):\n` + errors.slice(0, 40).map((e) => `  - ${e}`).join('\n'));
    process.exit(1);
  }
  console.log(`OK: ${world.objects.length} objects, ${world.links.length} links. All synthetic, no cross-client references, evidence present.`);
  if (live.length) console.log(`OK: ${live.length} public records from data/live-snapshot.json, each with its official link.`);
}
