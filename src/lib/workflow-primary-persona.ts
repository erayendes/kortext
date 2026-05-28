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
  '01b-onboarding-pipeline': '+engineering-manager',
  '02-planning-pipeline': '+operation-manager',
  '02b-spike-workflow': '+engineering-manager',
  '03-environment-setup': '+devops-engineer',
  '04-development-cycle': '+backend-developer',
  '05-test-cycle': '+qa-engineer',
  '06-deployment-cycle': '+devops-engineer',
  '07-rollback-pipeline': '+devops-engineer',
  '08-hotfix-pipeline': '+backend-developer',
  '09-maintenance-cycle': '+engineering-manager',
};

export function primaryPersonaFor(workflowId: string): string {
  return WORKFLOW_PERSONA[workflowId] ?? '+operation-manager';
}
