import type { Repositories } from '../db/repositories/index.ts';
import type { WorkflowRegistry } from '../engine/workflow-loader.ts';
import type { PersonaRegistry } from '../engine/persona-registry.ts';
import { findUnknownPersonas, SYNTHETIC_PERSONA_HANDLES } from '../engine/consistency.ts';
import { isBlocked } from '../orchestrator/build-order.ts';

/**
 * `kortext doctor` — health snapshot across registries and runtime state.
 *
 * Pure function: takes already-loaded registries plus a repos handle and
 * returns a structured report. The CLI layer (bin/kortext.ts) formats it
 * for humans; the same shape feeds the dashboard health panel.
 */

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
  details?: unknown;
};

export type DoctorSummary = {
  workflowsLoaded: number;
  workflowErrors: number;
  personasLoaded: number;
  personaErrors: number;
  unknownPersonaRefs: number;
  staleLocks: number;
  blockedItems: number;
};

export type DoctorReport = {
  findings: DoctorFinding[];
  summary: DoctorSummary;
  /** True when at least one finding has severity='error'. */
  hasErrors: boolean;
};

export type DoctorOptions = {
  workflows: WorkflowRegistry;
  personas: PersonaRegistry;
  repos: Repositories;
  now?: () => Date;
  /** Persona handles allowed to be missing from the registry. */
  allowedMissingPersonas?: string[];
};

const DEFAULT_ALLOWED_MISSING = [...SYNTHETIC_PERSONA_HANDLES];

export function runDoctor(opts: DoctorOptions): DoctorReport {
  const allowedMissing = new Set(opts.allowedMissingPersonas ?? DEFAULT_ALLOWED_MISSING);
  const now = (opts.now ?? (() => new Date()))().getTime();

  const findings: DoctorFinding[] = [];

  // ---- workflows ----
  const wfErrors = opts.workflows.errors();
  const wfList = opts.workflows.list();
  if (wfErrors.length === 0) {
    findings.push({
      category: 'workflow',
      severity: 'ok',
      message: `${wfList.length} workflow(s) loaded`,
    });
  } else {
    for (const e of wfErrors) {
      findings.push({
        category: 'workflow',
        severity: 'error',
        message: `${e.file}: ${e.reason}`,
        details: e,
      });
    }
  }

  // ---- personas ----
  const personaErrors = opts.personas.errors();
  const personaList = opts.personas.list();
  if (personaErrors.length === 0) {
    findings.push({
      category: 'persona',
      severity: 'ok',
      message: `${personaList.length} persona(s) loaded`,
    });
  } else {
    for (const e of personaErrors) {
      findings.push({
        category: 'persona',
        severity: 'error',
        message: `${e.file}: ${e.reason}`,
        details: e,
      });
    }
  }

  // ---- cross-references ----
  const unknownRefs = findUnknownPersonas(opts.workflows, opts.personas).filter(
    (f) => !allowedMissing.has(f.persona),
  );
  if (unknownRefs.length === 0) {
    findings.push({
      category: 'cross-ref',
      severity: 'ok',
      message: 'all persona handles resolve',
    });
  } else {
    for (const ref of unknownRefs) {
      findings.push({
        category: 'cross-ref',
        severity: 'error',
        message: `workflow '${ref.workflowId}' step ${ref.stepKey} references unknown persona ${ref.persona}`,
        details: ref,
      });
    }
  }

  // ---- stale locks ----
  const allLocks = opts.repos.locks.list();
  const staleLocks = allLocks.filter(
    (l) => l.expires_at !== null && l.expires_at < now,
  );
  if (staleLocks.length === 0) {
    findings.push({ category: 'lock', severity: 'ok', message: 'no stale locks' });
  } else {
    findings.push({
      category: 'lock',
      severity: 'warn',
      message: `${staleLocks.length} stale lock(s): ${staleLocks.map((l) => l.resource).join(', ')}`,
      details: staleLocks,
    });
  }

  // ---- locked (dependency-blocked) items ----
  // `blocked` is not a status (UAT #10) — the lock is DERIVED: an item whose
  // `blocked_by` lists a non-terminal dependency. Count those, not a column.
  const allItems = opts.repos.backlog.list({ limit: 100_000 });
  const byId = new Map(allItems.map((i) => [i.id, i]));
  const blockedCount = allItems.filter((i) => isBlocked(i, byId)).length;
  if (blockedCount === 0) {
    findings.push({ category: 'item', severity: 'ok', message: 'no locked items' });
  } else {
    findings.push({
      category: 'item',
      severity: 'warn',
      message: `${blockedCount} locked item(s) (waiting on dependencies)`,
    });
  }

  const summary: DoctorSummary = {
    workflowsLoaded: wfList.length,
    workflowErrors: wfErrors.length,
    personasLoaded: personaList.length,
    personaErrors: personaErrors.length,
    unknownPersonaRefs: unknownRefs.length,
    staleLocks: staleLocks.length,
    blockedItems: blockedCount,
  };

  return {
    findings,
    summary,
    hasErrors: findings.some((f) => f.severity === 'error'),
  };
}

/**
 * Human-readable text format. Used by `bin/kortext.ts` doctor command.
 */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  const icon = (s: DoctorSeverity) => (s === 'ok' ? '✔' : s === 'warn' ? '⚠' : '✖');
  for (const f of report.findings) {
    lines.push(`${icon(f.severity)} [${f.category}] ${f.message}`);
  }
  return lines.join('\n');
}
