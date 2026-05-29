import type { WorkflowRegistry } from './workflow-loader.ts';
import type { PersonaRegistry } from './persona-registry.ts';

/**
 * Cross-validation helpers between workflow and persona registries.
 *
 * Feeds `kortext doctor` (Faz 5.5). Kept in its own module so neither
 * registry depends on the other.
 */

export type UnknownPersonaFinding = {
  workflowId: string;
  stepKey: string;
  persona: string;
};

/**
 * Persona handles that may legitimately appear in workflow steps without a
 * corresponding `agents/*.md` file. Callers use this as their "allowed
 * missing" policy (findUnknownPersonas itself stays policy-free):
 *   - '+prime'    — human approver (workflow gates).
 *   - '+assignee' — dynamic token; resolved at runtime to the backlog item's
 *                   assignee developer (DECISIONS Bölüm 5.4).
 *   - '+approver' — dynamic token; resolved at runtime to the item's approver
 *                   (gate opens when it resolves to '+prime').
 */
export const SYNTHETIC_PERSONA_HANDLES: readonly string[] = [
  '+prime',
  '+assignee',
  '+approver',
];

/**
 * For every step.persona referenced across all workflows in `workflows`,
 * verify that `personas` knows about it. Steps with no persona handle
 * are ignored. The human handle '+prime' is intentionally NOT special-
 * cased here — that policy lives in callers (e.g. `kortext doctor`)
 * which can filter it out if they want to.
 */
export function findUnknownPersonas(
  workflows: WorkflowRegistry,
  personas: PersonaRegistry,
): UnknownPersonaFinding[] {
  const findings: UnknownPersonaFinding[] = [];
  for (const wf of workflows.list()) {
    for (const step of wf.steps) {
      if (!step.persona) continue;
      if (personas.get(step.persona) === null) {
        findings.push({
          workflowId: wf.id,
          stepKey: step.key,
          persona: step.persona,
        });
      }
    }
  }
  return findings;
}
