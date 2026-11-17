// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Monday morning in the demo: the weekly assistant has run for every client, and a consultant has asked to change a
// client position. Both wait for the engagement lead, so the approval screens are not empty on first open.
import type { Store } from '../ontology/runtime.ts';
import { runWeeklyAgent } from './agent.ts';
import type { AgentRun } from './agent.ts';

export async function openWeek(store: Store, clientIds: readonly string[]): Promise<Record<string, AgentRun>> {
  const runs: Record<string, AgentRun> = {};
  for (const clientId of clientIds) runs[clientId] = await runWeeklyAgent(store, { clientId, applyTriage: true });
  if (clientIds.includes('cli-aster')) {
    store.applyAction({ actor: 'consultant-aster-1', role: 'consultant', clientIds: ['cli-aster'] }, 'setClientPosition', {
      clientId: 'cli-aster', targetId: 'bill-004', stance: 'amend',
      rationale: 'Aster Robotics supports the sidewalk operation standards and wants a cargo class and pilot zone exemptions written into them.',
    });
  }
  return runs;
}
