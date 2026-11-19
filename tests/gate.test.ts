// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { describe, expect, it, vi } from 'vitest';
import { assertProviderAllowed, defaultGate, ProviderGateError, serializeForProvider } from '../ontology/markings.ts';
import { disabledLlm, guardedComplete, LlmDisabledError } from '../agent/llm.ts';
import type { LlmAdapter } from '../agent/llm.ts';
import { freshStore, principal } from './helpers.ts';

const v = freshStore().as(principal);
const publicBill = v.get('bill-001')!;
const clientPosition = v.list('ClientPosition')[0];
const gate = { approvedClientDataProviders: ['approved-private'] };

describe('model-provider gate', () => {
  it('lets public objects go to any provider', () => {
    expect(() => assertProviderAllowed('any-provider', [publicBill])).not.toThrow();
  });
  it('blocks client objects by default and for providers not on the list', () => {
    expect(() => serializeForProvider('approved-private', [clientPosition])).toThrow(ProviderGateError);
    expect(() => serializeForProvider('some-other-model', [publicBill, clientPosition], gate)).toThrow(/not approved for company data/);
  });
  it('lets an allow-listed provider receive client objects', () => {
    expect(serializeForProvider('approved-private', [clientPosition], gate)).toContain(clientPosition.id);
  });
  it('fails closed when an object has no markings', () => {
    expect(() => assertProviderAllowed('x', [{ id: 'unmarked' }])).toThrow(ProviderGateError);
  });
  it('guardedComplete checks the gate before the adapter sees any data', async () => {
    const complete = vi.fn(async () => 'ok');
    const adapter: LlmAdapter = { provider: 'unlisted', enabled: true, complete };
    await expect(guardedComplete(adapter, { instruction: 'x', objects: [clientPosition] }, defaultGate)).rejects.toThrow(ProviderGateError);
    expect(complete).not.toHaveBeenCalled();
    const ok: LlmAdapter = { provider: 'approved-private', enabled: true, complete };
    await expect(guardedComplete(ok, { instruction: 'x', objects: [clientPosition] }, gate)).resolves.toBe('ok');
  });
  it('the default adapter is disabled', async () => {
    expect(disabledLlm.enabled).toBe(false);
    await expect(guardedComplete(disabledLlm, { instruction: 'x', objects: [publicBill] })).rejects.toThrow(LlmDisabledError);
  });
});
