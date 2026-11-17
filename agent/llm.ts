// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Optional LLM adapter. Disabled by default; the app and tests run fully offline.
// Every call goes through the marking gate first, so client data cannot reach a provider
// that is not on the allow-list, even if someone enables an adapter by mistake.
import { defaultGate, serializeForProvider } from '../ontology/markings.ts';
import type { GateConfig, Marked } from '../ontology/markings.ts';

export interface LlmAdapter {
  provider: string;
  enabled: boolean;
  complete(prompt: string): Promise<string>;
}

export class LlmDisabledError extends Error {
  constructor() {
    super('LLM adapter is disabled; the rule-based path was used');
    this.name = 'LlmDisabledError';
  }
}

export const disabledLlm: LlmAdapter = {
  provider: 'none',
  enabled: false,
  complete: () => Promise.reject(new LlmDisabledError()),
};

export interface LlmRequest {
  instruction: string;
  objects: readonly Marked[]; // ontology objects the model may see
}

export async function guardedComplete(adapter: LlmAdapter, req: LlmRequest, gate: GateConfig = defaultGate): Promise<string> {
  if (!adapter.enabled) throw new LlmDisabledError(); // a disabled adapter never receives data, so there is nothing to gate
  const context = serializeForProvider(adapter.provider, req.objects, gate); // throws ProviderGateError
  return adapter.complete(`${req.instruction}\n\nContext (JSON):\n${context}`);
}
