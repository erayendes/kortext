/**
 * Workflow → primary persona mapping.
 *
 * The dashboard's Active Work card shows a persona avatar per run. Pulling
 * the actual current step persona requires per-run `/api/runs/:id` fetches;
 * for the v3.1 dashboard polish we hard-map each workflow to the persona
 * that owns it end-to-end. The real per-step persona is still surfaced
 * inside the run detail drawer (later phase).
 */

const WORKFLOW_PERSONA: Record<string, string> = {
  'new-project-analysis': '+operation-manager',
  'existing-project-analysis': '+engineering-manager',
  'planning-pipeline': '+operation-manager',
  'spike-pipeline': '+engineering-manager',
  'environment-setup': '+devops-engineer',
  'development-cycle': '+backend-developer',
  'test-cycle': '+qa-engineer',
  'deployment-cycle': '+devops-engineer',
  'incident-pipeline': '+devops-engineer',
};

export function primaryPersonaFor(workflowId: string): string {
  return WORKFLOW_PERSONA[workflowId] ?? '+operation-manager';
}
