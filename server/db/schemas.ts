import { z } from 'zod';

/**
 * Reusable primitives.
 * Timestamps: Unix milliseconds (number).
 * JSON columns: stored as TEXT; surfaced as already-parsed values.
 */

const Timestamp = z.number().int().nonnegative();
const PersonaHandle = z.string().min(1); // e.g. '+frontend-engineer'

// ---------- backlog_items ----------

export const BacklogItemTypeSchema = z.enum([
  'task',
  'bug',
  'debt',
  'epic',
  'spike',
  'hotfix',
]);
export type BacklogItemType = z.infer<typeof BacklogItemTypeSchema>;

export const BacklogStatusSchema = z.enum([
  'to_do',
  'in_progress',
  'blocked',
  'test',
  'review',
  'done',
  'cancelled',
]);
export type BacklogStatus = z.infer<typeof BacklogStatusSchema>;

export const BacklogItemSchema = z.object({
  id: z.string().min(1),
  type: BacklogItemTypeSchema,
  title: z.string().min(1),
  status: BacklogStatusSchema,
  owner: PersonaHandle.nullable(),
  parent_id: z.string().nullable(),
  version: z.string().nullable(),
  frontmatter: z.record(z.unknown()),
  body_md: z.string(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type BacklogItem = z.infer<typeof BacklogItemSchema>;

export const BacklogItemInsertSchema = BacklogItemSchema.omit({
  created_at: true,
  updated_at: true,
}).extend({
  status: BacklogStatusSchema.default('to_do'),
  frontmatter: z.record(z.unknown()).default({}),
  body_md: z.string().default(''),
  owner: PersonaHandle.nullable().default(null),
  parent_id: z.string().nullable().default(null),
  version: z.string().nullable().default(null),
});
export type BacklogItemInsert = z.input<typeof BacklogItemInsertSchema>;

// ---------- sessions ----------

export const SessionEntryPointSchema = z.enum(['cli', 'mcp', 'dashboard', 'cron', 'system']);
export type SessionEntryPoint = z.infer<typeof SessionEntryPointSchema>;

export const SessionSchema = z.object({
  id: z.number().int().positive(),
  started_by: z.string().min(1),
  entry_point: SessionEntryPointSchema,
  metadata: z.record(z.unknown()),
  started_at: Timestamp,
  ended_at: Timestamp.nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionInsertSchema = z.object({
  started_by: z.string().min(1),
  entry_point: SessionEntryPointSchema,
  metadata: z.record(z.unknown()).default({}),
});
export type SessionInsert = z.input<typeof SessionInsertSchema>;

// ---------- contexts ----------

export const ContextSchema = z.object({
  id: z.number().int().positive(),
  persona: PersonaHandle,
  item_id: z.string().nullable(),
  session_id: z.number().int().positive().nullable(),
  payload: z.record(z.unknown()),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Context = z.infer<typeof ContextSchema>;

export const ContextUpsertSchema = z.object({
  persona: PersonaHandle,
  item_id: z.string().nullable().default(null),
  session_id: z.number().int().positive().nullable().default(null),
  payload: z.record(z.unknown()).default({}),
});
export type ContextUpsert = z.input<typeof ContextUpsertSchema>;

// ---------- locks ----------

export const LockSchema = z.object({
  id: z.number().int().positive(),
  resource: z.string().min(1),
  holder: PersonaHandle,
  reason: z.string().nullable(),
  acquired_at: Timestamp,
  expires_at: Timestamp.nullable(),
});
export type Lock = z.infer<typeof LockSchema>;

export const LockInsertSchema = z.object({
  resource: z.string().min(1),
  holder: PersonaHandle,
  reason: z.string().nullable().default(null),
  expires_at: Timestamp.nullable().default(null),
});
export type LockInsert = z.input<typeof LockInsertSchema>;

// ---------- handovers ----------

export const HandoverSchema = z.object({
  id: z.number().int().positive(),
  item_id: z.string().nullable(),
  from_persona: PersonaHandle,
  to_persona: PersonaHandle,
  reason: z.string().nullable(),
  context_payload: z.record(z.unknown()),
  markdown_path: z.string().nullable(),
  created_at: Timestamp,
});
export type Handover = z.infer<typeof HandoverSchema>;

export const HandoverInsertSchema = z.object({
  item_id: z.string().nullable().default(null),
  from_persona: PersonaHandle,
  to_persona: PersonaHandle,
  reason: z.string().nullable().default(null),
  context_payload: z.record(z.unknown()).default({}),
  markdown_path: z.string().nullable().default(null),
});
export type HandoverInsert = z.input<typeof HandoverInsertSchema>;

// ---------- decisions_index ----------

export const DecisionStatusSchema = z.enum([
  'proposed',
  'accepted',
  'superseded',
  'rejected',
]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const DecisionIndexSchema = z.object({
  id: z.number().int().positive(),
  decision_id: z.string().min(1),
  title: z.string().min(1),
  status: DecisionStatusSchema,
  markdown_path: z.string().min(1),
  item_id: z.string().nullable(),
  tags: z.array(z.string()),
  created_at: Timestamp,
  decided_at: Timestamp.nullable(),
});
export type DecisionIndex = z.infer<typeof DecisionIndexSchema>;

export const DecisionIndexInsertSchema = z.object({
  decision_id: z.string().min(1),
  title: z.string().min(1),
  status: DecisionStatusSchema.default('proposed'),
  markdown_path: z.string().min(1),
  item_id: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  decided_at: Timestamp.nullable().default(null),
});
export type DecisionIndexInsert = z.input<typeof DecisionIndexInsertSchema>;

// ---------- runs ----------

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'awaiting_approval',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSchema = z.object({
  id: z.number().int().positive(),
  workflow_id: z.string().min(1),
  item_id: z.string().nullable(),
  status: RunStatusSchema,
  worktree_path: z.string().nullable(),
  triggered_by: z.string().min(1),
  error_message: z.string().nullable(),
  started_at: Timestamp.nullable(),
  ended_at: Timestamp.nullable(),
  created_at: Timestamp,
});
export type Run = z.infer<typeof RunSchema>;

export const RunInsertSchema = z.object({
  workflow_id: z.string().min(1),
  item_id: z.string().nullable().default(null),
  status: RunStatusSchema.default('queued'),
  worktree_path: z.string().nullable().default(null),
  triggered_by: z.string().min(1),
});
export type RunInsert = z.input<typeof RunInsertSchema>;

// ---------- run_steps ----------

export const RunStepStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
]);
export type RunStepStatus = z.infer<typeof RunStepStatusSchema>;

export const RunStepSchema = z.object({
  id: z.number().int().positive(),
  run_id: z.number().int().positive(),
  step_index: z.number().int().nonnegative(),
  step_name: z.string().min(1),
  persona: PersonaHandle.nullable(),
  status: RunStepStatusSchema,
  started_at: Timestamp.nullable(),
  ended_at: Timestamp.nullable(),
  log_path: z.string().nullable(),
  output_summary: z.string().nullable(),
  error_message: z.string().nullable(),
});
export type RunStep = z.infer<typeof RunStepSchema>;

export const RunStepInsertSchema = z.object({
  run_id: z.number().int().positive(),
  step_index: z.number().int().nonnegative(),
  step_name: z.string().min(1),
  persona: PersonaHandle.nullable().default(null),
  status: RunStepStatusSchema.default('pending'),
});
export type RunStepInsert = z.input<typeof RunStepInsertSchema>;

// ---------- pending_questions ----------

export const PendingQuestionStatusSchema = z.enum([
  'open',
  'answered',
  'expired',
  'cancelled',
]);
export type PendingQuestionStatus = z.infer<typeof PendingQuestionStatusSchema>;

export const PendingQuestionSchema = z.object({
  id: z.number().int().positive(),
  run_id: z.number().int().positive().nullable(),
  step_id: z.number().int().positive().nullable(),
  question: z.string().min(1),
  choices: z.array(z.string()),
  status: PendingQuestionStatusSchema,
  answer: z.string().nullable(),
  answered_by: z.string().nullable(),
  answered_at: Timestamp.nullable(),
  created_at: Timestamp,
});
export type PendingQuestion = z.infer<typeof PendingQuestionSchema>;

export const PendingQuestionInsertSchema = z.object({
  run_id: z.number().int().positive().nullable().default(null),
  step_id: z.number().int().positive().nullable().default(null),
  question: z.string().min(1),
  choices: z.array(z.string()).default([]),
});
export type PendingQuestionInsert = z.input<typeof PendingQuestionInsertSchema>;

// ---------- runtime_artifacts ----------

export const ArtifactKindSchema = z.enum([
  'worktree',
  'log',
  'diff',
  'stdout',
  'stderr',
  'file',
  'screenshot',
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const RuntimeArtifactSchema = z.object({
  id: z.number().int().positive(),
  run_id: z.number().int().positive().nullable(),
  step_id: z.number().int().positive().nullable(),
  kind: ArtifactKindSchema,
  path: z.string().min(1),
  bytes: z.number().int().nonnegative().nullable(),
  created_at: Timestamp,
});
export type RuntimeArtifact = z.infer<typeof RuntimeArtifactSchema>;

export const RuntimeArtifactInsertSchema = z.object({
  run_id: z.number().int().positive().nullable().default(null),
  step_id: z.number().int().positive().nullable().default(null),
  kind: ArtifactKindSchema,
  path: z.string().min(1),
  bytes: z.number().int().nonnegative().nullable().default(null),
});
export type RuntimeArtifactInsert = z.input<typeof RuntimeArtifactInsertSchema>;

// ---------- notifications_sent ----------

export const NotificationChannelSchema = z.enum(['slack', 'telegram', 'ui', 'email']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationStatusSchema = z.enum(['sent', 'failed', 'suppressed']);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

export const NotificationSchema = z.object({
  id: z.number().int().positive(),
  channel: NotificationChannelSchema,
  event_key: z.string().min(1),
  payload: z.record(z.unknown()),
  status: NotificationStatusSchema,
  error_message: z.string().nullable(),
  created_at: Timestamp,
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationInsertSchema = z.object({
  channel: NotificationChannelSchema,
  event_key: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  status: NotificationStatusSchema.default('sent'),
  error_message: z.string().nullable().default(null),
});
export type NotificationInsert = z.input<typeof NotificationInsertSchema>;

// ---------- secrets_scan_results ----------

export const SecretSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type SecretSeverity = z.infer<typeof SecretSeveritySchema>;

export const SecretScanResultSchema = z.object({
  id: z.number().int().positive(),
  run_id: z.number().int().positive().nullable(),
  scanned_path: z.string().min(1),
  finding_type: z.string().min(1),
  severity: SecretSeveritySchema,
  line_number: z.number().int().nonnegative().nullable(),
  context: z.string().nullable(),
  masked_snippet: z.string().nullable(),
  resolved: z.boolean(),
  created_at: Timestamp,
});
export type SecretScanResult = z.infer<typeof SecretScanResultSchema>;

export const SecretScanResultInsertSchema = z.object({
  run_id: z.number().int().positive().nullable().default(null),
  scanned_path: z.string().min(1),
  finding_type: z.string().min(1),
  severity: SecretSeveritySchema,
  line_number: z.number().int().nonnegative().nullable().default(null),
  context: z.string().nullable().default(null),
  masked_snippet: z.string().nullable().default(null),
});
export type SecretScanResultInsert = z.input<typeof SecretScanResultInsertSchema>;

// ---------- audit_log ----------

export const AuditLogSchema = z.object({
  id: z.number().int().positive(),
  actor: z.string().min(1),
  action: z.string().min(1),
  resource_type: z.string().nullable(),
  resource_id: z.string().nullable(),
  payload: z.record(z.unknown()),
  created_at: Timestamp,
});
export type AuditLogRow = z.infer<typeof AuditLogSchema>;

export const AuditLogInsertSchema = z.object({
  actor: z.string().min(1),
  action: z.string().min(1),
  resource_type: z.string().nullable().default(null),
  resource_id: z.string().nullable().default(null),
  payload: z.record(z.unknown()).default({}),
});
export type AuditLogInsert = z.input<typeof AuditLogInsertSchema>;
