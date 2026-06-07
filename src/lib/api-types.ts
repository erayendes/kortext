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
  /**
   * Init-phase artifact metadata (Project Initializing timeline). Optional on
   * the mirror because legacy fixtures/tests omit them; the live API sends them
   * for init questions (e.g. `.kortext/references/LEGAL.md`, `+legal-expert`).
   */
  artifact_path?: string | null;
  persona?: string | null;
  phase?: string | null;
};

export type DecisionStatus = 'proposed' | 'accepted' | 'superseded' | 'rejected';

export type DecisionIndex = {
  id: number;
  decision_id: string;
  title: string;
  status: DecisionStatus;
  markdown_path: string;
  item_id: string | null;
  tags: string[];
  created_at: number;
  decided_at: number | null;
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

/**
 * The 5 planning-selectable review gates — mirrors server/db/schemas.ts
 * `GateSchema`. A backlog item carries the subset that applies to it
 * (`review_gates`); the board maps these to the AC/QC/SE/DS/CR pills.
 */
export type Gate =
  | 'code_review'
  | 'quality_control'
  | 'security_control'
  | 'design_review'
  | 'uat';

export type BacklogItem = {
  id: string;
  type: 'epic' | 'task' | 'bug' | 'debt' | 'spike' | 'hotfix';
  title: string;
  status:
    | 'to_do'
    | 'in_progress'
    | 'blocked'
    | 'test'
    | 'review'
    | 'done'
    | 'cancelled';
  owner: string | null;
  parent_id: string | null;
  version: string | null;
  /**
   * The review gates selected for this item (the applicable set). Optional on
   * the frontend mirror because legacy fixtures/tests omit it; the live API
   * always sends an array (often empty).
   */
  review_gates?: Gate[];
  frontmatter: Record<string, unknown>;
  body_md: string;
  created_at: number;
  updated_at: number;
};

/**
 * Server-side aggregate for whole-set consumers: epic roll-up, facet filters,
 * status counts, and version/assignee option lists.
 * Returned by GET /api/backlog/aggregate.
 */
export type BacklogAggregate = {
  epics: BacklogItem[];
  epicProgress: Record<string, { total: number; done: number }>;
  statusCounts: Record<string, number>;
  versions: string[];
  /**
   * Per-version count of OPEN (non-done/cancelled) non-epic items. The board
   * derives its default active version from this so the choice is correct on
   * the first aggregate load, before any cards arrive (no version flicker).
   * Optional on the mirror because legacy fixtures/tests may omit it.
   */
  openByVersion?: Record<string, number>;
  assignees: string[];
  total: number;
};

/** One audit-log row, as returned by GET /api/backlog/:id/activity. */
export type ActivityEntry = {
  id: number;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: Record<string, unknown>;
  created_at: number;
};

export type ReportStatus = 'uninitialized' | 'writing' | 'approved';

export type ReportIndex = {
  id: number;
  scope: string;
  slug: string;
  file_path: string;
  author: string | null;
  status: ReportStatus;
  tags: string[];
  related_item: string | null;
  created_at: number;
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

// Full workflow definition — mirrors server/engine/workflow-parser.ts. Returned
// by GET /api/workflows/:id; the Workflows pane "Visual flow" renders it.
export type WorkflowStepDetail = {
  key: string;
  index: number;
  phase: string;
  persona: string | null;
  description: string;
  inputs: string[];
  outputs: string[];
  approver: string | null;
  reviewer: string | null;
};

export type WorkflowGate = {
  phase: string;
  afterStepIndex: number;
  body: string;
  approver: string | null;
};

export type WorkflowDetail = {
  id: string;
  title: string;
  startCommand: string | null;
  nextWorkflowId: string | null;
  steps: WorkflowStepDetail[];
  gates: WorkflowGate[];
};

export type BlueprintStatus =
  | 'uninitialized'
  | 'draft'
  | 'approved'
  | 'unknown';

export type ProjectType = 'new' | 'existing';

export type ExecutorChoice = 'mock' | 'claude' | 'codex' | 'antigravity';

export type ProjectMeta = {
  name: string;
  code: string;
  type: ProjectType;
  platforms: string[];
  githubRepo: string | null;
  executor: ExecutorChoice;
  executorBinary: string | null;
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
  executor: ExecutorChoice;
  executorBinary: string | null;
  projectDir: string | null;
};

export type BlueprintSubmitResponse = {
  ok: true;
  triggerWorkflowId: string;
  project: ProjectMeta;
  projectDir: string;
  initializedElsewhere: boolean;
  handoffUrl?: string; // bootstrap-wizard handoff target (real daemon URL)
  gitWarning?: string; // soft git-bootstrap warning, if any
};
