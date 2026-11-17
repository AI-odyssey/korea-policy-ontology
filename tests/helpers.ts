// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { readFileSync } from 'node:fs';
import { Store } from '../ontology/runtime.ts';
import type { World } from '../ontology/runtime.ts';
import type { Ctx } from '../ontology/markings.ts';
import type { Role } from '../ontology/schema.ts';

export const loadWorld = (): World => JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
export const freshStore = () => new Store(loadWorld());

export const CLIENTS = ['cli-aster', 'cli-moru', 'cli-wren'];
export const ctx = (role: Role, clientIds: string[] = CLIENTS, actor = `${role}-1`): Ctx => ({ actor, role, clientIds });
export const principal = ctx('principal');
export const asterConsultant = ctx('consultant', ['cli-aster'], 'consultant-aster-1');

/** Run fn and return the thrown error's code, or undefined when it did not throw. */
export function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? 'THROWN';
  }
}
