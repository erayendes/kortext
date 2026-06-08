import type { PersonaRegistry } from './persona-registry.ts';
import type { WorkflowRegistry } from './workflow-loader.ts';
import type { Repositories } from '../db/repositories/index.ts';
import { SYNTHETIC_PERSONA_HANDLES } from './consistency.ts';

/**
 * Faz 12.8 — engine-boot synchronization of the markdown registries into
 * the SQL projection tables (`personas`, `workflow_steps`).
 *
 * The two registries (`PersonaRegistry`, `WorkflowRegistry`) remain the
 * working representation in memory; this module's job is to mirror them
 * into SQL so the dashboard can run cross-cut queries ("how many steps
 * does this persona own?", "which files does this workflow touch?")
 * without re-parsing markdown on every request.
 *
 * Validation discipline:
 *   - Personas are upserted first so workflow_steps' FK to
 *     `personas.handle` can be satisfied.
 *   - Workflow steps that name an unknown persona handle cause the boot
 *     sync to throw with a categorized error. The boot path is expected
 *     to surface this as a fatal — there's no path forward when a
 *     workflow references an agent the engine cannot resolve.
 *   - `+prime` is the human handle; it's allowed in workflow steps even
 *     without an `agents/prime.md` file. We synthesize a minimal placeholder
 *     row so FK doesn't reject those references.
 */

/**
 * Display metadata for the synthetic handles (those with no agents/*.md).
 * The canonical handle list is SYNTHETIC_PERSONA_HANDLES in consistency.ts.
 */
const SYNTHETIC_PERSONA_META: Record<
  string,
  { purpose: string; whenToUse: string }
> = {
  '+prime': {
    purpose: 'Human approver. Final decision authority on gates.',
    whenToUse: 'Used as approver / reviewer on critical workflow gates.',
  },
  '+assignee': {
    purpose: "Dynamic token. Resolves at runtime to the backlog item's assignee developer.",
    whenToUse: 'Development-cycle implementation/closing; bound per run from item.assignee.',
  },
  '+approver': {
    purpose: "Dynamic token. Resolves at runtime to the backlog item's approver.",
    whenToUse: 'Development-cycle final review; gate opens when it resolves to +prime.',
  },
};

/**
 * Extract a section body keyed by an H2 heading (e.g. `## purpose`).
 * Returns the trimmed paragraph text, or null when the section is missing.
 */
function extractSection(systemPrompt: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const match = re.exec(systemPrompt);
  if (!match) return null;
  const start = match.index + match[0].length;
  // Body runs until the next `## ` heading or EOF.
  const tailRe = /^##\s+/gm;
  tailRe.lastIndex = start;
  const next = tailRe.exec(systemPrompt);
  const end = next ? next.index : systemPrompt.length;
  const body = systemPrompt.slice(start, end).trim();
  return body.length === 0 ? null : body;
}

export type IndexSyncResult = {
  personasUpserted: number;
  workflowStepsUpserted: number;
  /** Workflow steps that reference an unknown persona handle. */
  unknownPersonas: {
    workflowId: string;
    stepIndex: number;
    persona: string;
  }[];
  /** Steps with no persona handle in the markdown (skipped). */
  stepsWithoutPersona: { workflowId: string; stepIndex: number }[];
};

/**
 * Synchronize personas + workflow_steps from in-memory registries into
 * SQL. Throws when any workflow step references an unknown persona —
 * the error message lists every offending reference so the operator
 * sees the full picture in one boot output.
 */
export function syncRegistriesToDb(
  registries: {
    personas: PersonaRegistry;
    workflows: WorkflowRegistry;
  },
  repos: Repositories,
): IndexSyncResult {
  const { personas, workflows } = registries;

  // 0) Wipe in FK-safe order: children before parents.
  //    workflow_steps references personas(handle); deleting personas
  //    first would trip the FK on a re-run. Wiping + repopulating is
  //    cheaper than diffing and guarantees the tables match disk after
  //    every boot.
  repos.workflowSteps.deleteAll();
  repos.personas.deleteAll();
  let personasUpserted = 0;
  for (const def of personas.list()) {
    const purpose = extractSection(def.systemPrompt, 'purpose');
    const whenToUse = extractSection(def.systemPrompt, 'when to use');
    repos.personas.upsert({
      handle: def.handle,
      purpose,
      when_to_use: whenToUse,
      capabilities: [],
      model_default: def.model ?? null,
      source_path: `agents/${def.id}.md`,
    });
    personasUpserted += 1;
  }

  // Synthesize rows for handles that have no agents/*.md file — the human
  // approver (+prime) and the dynamic tokens (+assignee/+approver) resolved
  // at runtime from the run's item. FK would otherwise reject workflow steps
  // that reference them. (Runtime resolution: DECISIONS Bölüm 5.9 #2.)
  for (const handle of SYNTHETIC_PERSONA_HANDLES) {
    if (repos.personas.get(handle)) continue;
    const meta = SYNTHETIC_PERSONA_META[handle];
    repos.personas.upsert({
      handle,
      purpose: meta?.purpose ?? null,
      when_to_use: meta?.whenToUse ?? null,
      capabilities: [],
      model_default: null,
      source_path: '(synthetic)',
    });
    personasUpserted += 1;
  }

  // 2) Workflow steps. Skip steps with no persona handle (free-text
  //    bullets exist in some workflow files); collect unknown-persona
  //    references and raise a single error at the end so the operator
  //    sees every broken reference at once. (Table already wiped above.)
  const unknown: IndexSyncResult['unknownPersonas'] = [];
  const skipped: IndexSyncResult['stepsWithoutPersona'] = [];
  let workflowStepsUpserted = 0;

  for (const wf of workflows.list()) {
    const sourcePath = `workflows/${wf.id}.md`;
    for (const step of wf.steps) {
      if (!step.persona) {
        skipped.push({ workflowId: wf.id, stepIndex: step.index });
        continue;
      }
      if (!repos.personas.get(step.persona)) {
        unknown.push({
          workflowId: wf.id,
          stepIndex: step.index,
          persona: step.persona,
        });
        continue;
      }
      repos.workflowSteps.upsert({
        workflow_id: wf.id,
        step_no: step.index,
        step_name: step.key,
        persona_handle: step.persona,
        inputs: step.inputs,
        outputs: step.outputs,
        gate_kind: null,
        parallel_with: [],
        source_path: sourcePath,
      });
      workflowStepsUpserted += 1;
    }
  }

  if (unknown.length > 0) {
    const lines = unknown
      .map(
        (u) =>
          `  - ${u.workflowId} step ${u.stepIndex} references unknown persona '${u.persona}'`,
      )
      .join('\n');
    throw new Error(
      `engine boot: workflow steps reference unknown persona handles:\n${lines}`,
    );
  }

  return {
    personasUpserted,
    workflowStepsUpserted,
    unknownPersonas: unknown,
    stepsWithoutPersona: skipped,
  };
}
