// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { describe, expect, it } from 'vitest';
import { ACTION_NAMES, actionTypes, ROLES } from '../ontology/schema.ts';
import { validateWorld } from '../ontology/validate.ts';
import { codeOf, ctx, freshStore, loadWorld } from './helpers.ts';

describe('permissions matrix', () => {
  // Empty params: an allowed role gets past the role check and fails on parameters; a denied role stops at the role check.
  for (const action of ACTION_NAMES) {
    for (const role of ROLES) {
      const allowed = (actionTypes[action].allowedRoles as readonly string[]).includes(role);
      it(`${role} ${allowed ? 'may' : 'may not'} run ${action}`, () => {
        const code = codeOf(() => freshStore().applyAction(ctx(role), action, {}));
        expect(code).toBe(allowed ? 'INVALID_PARAMS' : 'PERMISSION_DENIED');
      });
    }
  }

  it('matches the contract for the sensitive actions', () => {
    expect(actionTypes.updateBillStage.allowedRoles).toEqual(['system']);
    expect(actionTypes.resolveDecision.allowedRoles).toEqual(['principal']);
    expect(actionTypes.approveDeliverable.allowedRoles).toEqual(['principal']);
    expect(actionTypes.setClientPosition.requiresApproval).toBe(true);
    expect(actionTypes.setClientPosition.approverRole).toBe('principal');
    expect(actionTypes.draftDeliverable.allowedRoles).toContain('agent');
    expect(actionTypes.sendDeliverable.allowedRoles).not.toContain('agent');
  });

  it('records denied attempts in the audit log', () => {
    const s = freshStore();
    const agent = ctx('agent', ['cli-aster']);
    expect(codeOf(() => s.applyAction(agent, 'resolveDecision', {}))).toBe('PERMISSION_DENIED');
    const last = s.auditEntries(ctx('principal')).at(-1)!;
    expect(last).toMatchObject({ action: 'resolveDecision', status: 'denied', role: 'agent' });
  });

  it('inherited Object properties are not actions, parameters or types', () => {
    const s = freshStore();
    const p = ctx('principal');
    expect(codeOf(() => s.applyAction(p, 'toString' as never, {}))).toBe('UNKNOWN_ACTION');
    expect(codeOf(() => s.applyAction(p, 'constructor' as never, {}))).toBe('UNKNOWN_ACTION');
    expect(codeOf(() => s.applyAction(p, 'createTask', { clientId: 'cli-aster', title: 't', dueDate: '2026-11-20', owner: 'human', toString: 'x' }))).toBe('INVALID_PARAMS');
    const w = loadWorld();
    w.objects[0].type = 'toString';
    w.links[0].type = 'hasOwnProperty';
    const errors = validateWorld(w).join(' | ');
    expect(errors).toMatch(/unknown object type toString/);
    expect(errors).toMatch(/unknown link type/);
  });
});
