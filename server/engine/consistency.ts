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
