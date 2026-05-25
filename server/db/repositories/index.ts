import type Database from 'better-sqlite3';
import { BacklogRepository } from './backlog.ts';
import { SessionsRepository } from './sessions.ts';
import { ContextsRepository } from './contexts.ts';
import { LocksRepository } from './locks.ts';
import { HandoversRepository } from './handovers.ts';
import { DecisionsRepository } from './decisions.ts';
import { ReportsRepository } from './reports.ts';
import { RunsRepository } from './runs.ts';
import { PendingQuestionsRepository } from './pending-questions.ts';
import { RuntimeArtifactsRepository } from './runtime-artifacts.ts';
import { NotificationsRepository } from './notifications.ts';
import { SecretsRepository } from './secrets.ts';
import { AuditLogRepository } from './audit-log.ts';
import { PersonasRepository } from './personas.ts';
import { WorkflowStepsRepository } from './workflow-steps.ts';

export {
  BacklogRepository,
  SessionsRepository,
  ContextsRepository,
  LocksRepository,
  HandoversRepository,
  DecisionsRepository,
  ReportsRepository,
  RunsRepository,
  PendingQuestionsRepository,
  RuntimeArtifactsRepository,
  NotificationsRepository,
  SecretsRepository,
  AuditLogRepository,
  PersonasRepository,
  WorkflowStepsRepository,
};

export type Repositories = {
  backlog: BacklogRepository;
  sessions: SessionsRepository;
  contexts: ContextsRepository;
  locks: LocksRepository;
  handovers: HandoversRepository;
  decisions: DecisionsRepository;
  reports: ReportsRepository;
  runs: RunsRepository;
  pendingQuestions: PendingQuestionsRepository;
  runtimeArtifacts: RuntimeArtifactsRepository;
  notifications: NotificationsRepository;
  secrets: SecretsRepository;
  auditLog: AuditLogRepository;
  personas: PersonasRepository;
  workflowSteps: WorkflowStepsRepository;
};

export function createRepositories(db: Database.Database): Repositories {
  return {
    backlog: new BacklogRepository(db),
    sessions: new SessionsRepository(db),
    contexts: new ContextsRepository(db),
    locks: new LocksRepository(db),
    handovers: new HandoversRepository(db),
    decisions: new DecisionsRepository(db),
    reports: new ReportsRepository(db),
    runs: new RunsRepository(db),
    pendingQuestions: new PendingQuestionsRepository(db),
    runtimeArtifacts: new RuntimeArtifactsRepository(db),
    notifications: new NotificationsRepository(db),
    secrets: new SecretsRepository(db),
    auditLog: new AuditLogRepository(db),
    personas: new PersonasRepository(db),
    workflowSteps: new WorkflowStepsRepository(db),
  };
}
