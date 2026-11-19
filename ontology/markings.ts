// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import type { Marking, Role } from './schema.ts';

export const PUBLIC: Marking = 'PUBLIC';
export const clientMarking = (clientId: string): Marking => `CLIENT:${clientId}`;

/** Who is calling: role plus the client layers this caller is assigned to. */
export interface Ctx {
  actor: string;
  role: Role;
  clientIds: readonly string[];
}

/** A record is visible only if every one of its markings is visible. No markings means hidden (fail closed). */
export function canSee(ctx: Ctx, markings: readonly Marking[] | undefined): boolean {
  if (!markings || markings.length === 0) return false;
  return markings.every((m) => m === 'PUBLIC' || ctx.clientIds.includes(m.slice('CLIENT:'.length)));
}

// ---- Model-provider gate ----
// Objects with a CLIENT marking may be serialized only for providers in the allow-list.
// Anything else throws, so a misconfigured adapter fails closed instead of leaking.

export interface GateConfig {
  approvedClientDataProviders: readonly string[];
}

/** Default: no provider is approved for company data. */
export const defaultGate: GateConfig = { approvedClientDataProviders: [] };

export class ProviderGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderGateError';
  }
}

export interface Marked {
  id: string;
  markings?: readonly Marking[];
}

export function assertProviderAllowed(provider: string, objects: readonly Marked[], cfg: GateConfig = defaultGate): void {
  for (const o of objects) {
    if (!o.markings || o.markings.length === 0) {
      throw new ProviderGateError(`${o.id} has no markings; refusing to send it to '${provider}'`);
    }
    if (o.markings.some((m) => m !== 'PUBLIC') && !cfg.approvedClientDataProviders.includes(provider)) {
      throw new ProviderGateError(`${o.id} is ${o.markings.join(',')}; provider '${provider}' is not approved for company data`);
    }
  }
}

/** The only way to turn ontology objects into text for a model provider. */
export function serializeForProvider(provider: string, objects: readonly Marked[], cfg: GateConfig = defaultGate): string {
  assertProviderAllowed(provider, objects, cfg);
  return JSON.stringify(objects);
}
