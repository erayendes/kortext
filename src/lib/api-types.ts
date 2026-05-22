/**
 * Lean response shapes mirrored from server/db/schemas.ts.
 *
 * We hand-mirror instead of importing zod types so the frontend bundle
 * never pulls in better-sqlite3 or other server-only transitive deps.
 * Keep these in sync when adding fields server-side.
 */

export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'awaiting_approval';

export type Run = {
  id: number;
  workflow_id: string;
  item_id: string | null;
  status: RunStatus;
  worktree_path: string | null;
  triggered_by: string;
  error_message: string | null;
  started_at: number | null;
  ended_at: number | null;
  created_at: number;
};

export type RunStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped';

export type RunStep = {
  id: number;
  run_id: number;
  step_index: number;
  step_name: string;
  persona: string | null;
  status: RunStepStatus;
  started_at: number | null;
  ended_at: number | null;
  log_path: string | null;
  output_summary: string | null;
  error_message: string | null;
};

export type PendingQuestion = {
  id: number;
  run_id: number | null;
  step_id: number | null;
  question: string;
  choices: string[];
  status: 'open' | 'answered' | 'expired' | 'cancelled';
  answer: string | null;
  answered_by: string | null;
  answered_at: number | null;
  created_at: number;
};

export type Handover = {
  id: number;
  item_id: string | null;
  from_persona: string;
  to_persona: string;
  reason: string | null;
  context_payload: Record<string, unknown>;
  markdown_path: string | null;
  created_at: number;
};

export type BacklogItem = {
  id: string;
  type: 'epic' | 'task' | 'bug' | 'debt' | 'spike' | 'hotfix';
  title: string;
  status: 'to_do' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled';
  owner: string | null;
  parent_id: string | null;
  version: string | null;
  frontmatter: Record<string, unknown>;
  body_md: string;
  created_at: number;
  updated_at: number;
};

export type DoctorSeverity = 'ok' | 'warn' | 'error';
export type DoctorCategory =
  | 'workflow'
  | 'persona'
  | 'cross-ref'
  | 'lock'
  | 'item';

export type DoctorFinding = {
  category: DoctorCategory;
  severity: DoctorSeverity;
  message: string;
};

export type DoctorReport = {
  findings: DoctorFinding[];
  summary: {
    workflowsLoaded: number;
    workflowErrors: number;
    personasLoaded: number;
    personaErrors: number;
    unknownPersonaRefs: number;
    staleLocks: number;
    blockedItems: number;
  };
  hasErrors: boolean;
};

export type PersonaSummary = {
  handle: string;
  id: string;
  description: string;
  promptLength: number;
};

export type WorkflowSummary = {
  id: string;
  title: string;
  startCommand: string | null;
  nextWorkflowId: string | null;
  stepCount: number;
  gateCount: number;
};

export type BlueprintStatus =
  | 'uninitialized'
  | 'draft'
  | 'approved'
  | 'unknown';

export type ProjectType = 'new' | 'existing';

export type ProjectMeta = {
  name: string;
  code: string;
  type: ProjectType;
  platforms: string[];
  githubRepo: string | null;
  createdAt: number;
};

export type BlueprintStatusResponse = {
  status: BlueprintStatus;
  blueprintPath: string;
  project: ProjectMeta | null;
};

export type BlueprintSubmitInput = {
  projectName: string;
  projectCode: string;
  projectType: ProjectType;
  platforms: string[];
  blueprintBody: string;
  githubRepo: string | null;
};

export type BlueprintSubmitResponse = {
  ok: true;
  triggerWorkflowId: string;
  project: ProjectMeta;
};
