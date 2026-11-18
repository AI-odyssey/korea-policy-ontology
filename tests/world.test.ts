// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateWorld, serializeWorld } from '../data/seed.ts';
import { validateWorld } from '../ontology/validate.ts';
import { loadWorld } from './helpers.ts';

const world = loadWorld();
const count = (t: string) => world.objects.filter((o) => o.type === t).length;
const fileText = readFileSync(new URL('../data/world.json', import.meta.url), 'utf8');

describe('world.json', () => {
  it('is exactly what the seeded generator produces', () => {
    expect(serializeWorld(generateWorld())).toBe(fileText);
  });

  it('is within the contract size ranges', () => {
    const within = (t: string, lo: number, hi: number) => {
      expect(count(t), t).toBeGreaterThanOrEqual(lo);
      expect(count(t), t).toBeLessThanOrEqual(hi);
    };
    within('Issue', 9, 12); within('Bill', 25, 35); within('Provision', 15, 25); within('Institution', 15, 40);
    within('Person', 40, 60); within('StakeholderOrg', 10, 15); within('Event', 30, 50); within('Signal', 120, 200); within('Engagement', 3, 3);
    expect(world.objects.filter((o) => o.type === 'Person' && o.kind === 'lawmaker').length).toBeGreaterThanOrEqual(25);
    expect(world.objects.filter((o) => o.type === 'Bill' && o.stage === 'merged_alternative').length).toBeGreaterThan(0);
    expect(world.objects.filter((o) => o.type === 'Client').every((o) => !('isFictional' in o))).toBe(true); // synthetic: true already says it
    expect(world.objects.filter((o) => o.type === 'Client').map((o) => o.name).sort()).toEqual(['Aster Robotics', 'Moru Foods', 'Wrenfield Pay']);
  });

  it('contains the story: noise to dismiss, weak evidence to review, an unprocessed week', () => {
    const sigs = world.objects.filter((o) => o.type === 'Signal');
    expect(sigs.filter((s) => s.status === 'dismissed').length).toBeGreaterThanOrEqual(3);
    expect(sigs.filter((s) => s.status === 'new').length).toBeGreaterThanOrEqual(20);
    expect(world.objects.filter((o) => o.type === 'Evidence' && o.reviewStatus === 'review').length).toBeGreaterThanOrEqual(8);
    expect(new Set(sigs.map((s) => s.sourceType)).size).toBe(5);
    expect(sigs.every((s) => s.collectedAt >= '2026-10-05' && s.collectedAt <= '2026-11-17')).toBe(true);
  });

  it('uses only synthetic hosts and neutral party labels', () => {
    const hosts = new Set([...fileText.matchAll(/https?:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]));
    expect([...hosts]).toEqual(['example.invalid']);
    expect(new Set(world.objects.filter((o) => o.party).map((o) => o.party))).toEqual(new Set(['Party A', 'Party B', 'Party C']));
    expect(fileText).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});

describe('validator', () => {
  const mutate = (fn: (w: ReturnType<typeof loadWorld>) => void) => {
    const w = loadWorld();
    fn(w);
    return validateWorld(w).join('\n');
  };

  it('passes on world.json', () => {
    expect(validateWorld(world)).toEqual([]);
  });
  it('catches a non-synthetic record', () => {
    expect(mutate((w) => { (w.objects[0] as { synthetic: boolean }).synthetic = false; })).toMatch(/synthetic/);
  });
  it('catches a public link with no evidence', () => {
    expect(mutate((w) => { w.links.find((l) => l.type === 'sponsors')!.evidence = []; })).toMatch(/at least one Evidence/);
  });
  it('catches a public object referencing a client object', () => {
    expect(mutate((w) => { w.objects.find((o) => o.id === 'bill-001')!.mergedInto = 'cli-aster'; })).toMatch(/PUBLIC object references CLIENT/);
  });
  it('catches a cross-client reference', () => {
    expect(mutate((w) => { w.objects.find((o) => o.id === 'task-aster-1')!.subjectId = 'pos-moru-1'; })).toMatch(/cross-client/);
  });
  it('catches a link joining two clients', () => {
    expect(mutate((w) => { w.links.find((l) => l.type === 'watches' && l.from === 'eng-aster')!.from = 'eng-moru'; })).toMatch(/different clients|does not match/);
  });
  it('catches a cardinality violation', () => {
    expect(mutate((w) => {
      const l = w.links.find((x) => x.type === 'sponsors')!;
      w.links.push({ ...l, id: 'lnk-x', from: 'per-001' });
    })).toMatch(/more than one incoming sponsors/);
  });
  it('catches a missing required link', () => {
    expect(mutate((w) => { w.links = w.links.filter((l) => !(l.type === 'about' && l.from === 'bill-001')); })).toMatch(/bill-001: needs at least one outgoing about/);
  });
  it('catches a wrong marking', () => {
    expect(mutate((w) => { w.objects.find((o) => o.id === 'pos-aster-1')!.markings = ['PUBLIC']; })).toMatch(/markings should be/);
  });
});

describe('validator after the week is opened', () => {
  it('accepts a client-marked filing: links between public objects and their evidence carry the same client marking', async () => {
    const { openWeek } = await import('../agent/index.ts');
    const { freshStore, CLIENTS } = await import('./helpers.ts');
    const s = freshStore();
    await openWeek(s, CLIENTS);
    const w = s.snapshot().world;
    expect(w.links.some((l) => l.type === 'about' && l.markings.some((m) => m.startsWith('CLIENT:')))).toBe(true);
    expect(validateWorld(w)).toEqual([]);
    // A client-marked link whose evidence is public is still an error, and so is client evidence under a public link.
    const l = w.links.find((x) => x.type === 'about' && x.markings[0] === 'CLIENT:cli-aster')!;
    const ev = w.objects.find((o) => o.id === l.evidence[0])!;
    ev.markings = ['PUBLIC'];
    expect(validateWorld(w).join('\n')).toMatch(/same marking/);
  });
});
