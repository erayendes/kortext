import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { RunsRepository } from '../db/repositories/runs.ts';
import type { WorkflowGraph } from './dag.ts';

/**
 * Pre-flight gate that decides whether a workflow may start.
 *
 * Two classes of check:
 *   1. Every file in `graph.externalInputs` must exist and have
 *      `status: approved` in its YAML frontmatter.
 *   2. If `previousWorkflowId` is given, at least one run of that workflow
 *      must have ended in `succeeded` state.
 *
 * Either failure mode returns `ok: false` with a structured `failures` array
 * so callers (and later the orchestrator UI) can show specific problems.
 */

export type GateFailureKind =
  | 'missing-input'
  | 'unapproved-input'
  | 'previous-not-succeeded';

export type GateFailure = {
  kind: GateFailureKind;
  message: string;
  path?: string;
  workflowId?: string;
};

export type GateCheckResult = {
  ok: boolean;
  failures: GateFailure[];
};

export type GateEnforcerOptions = {
  repoRoot: string;
  runs: RunsRepository;
};

export type GateCheckOptions = {
  previousWorkflowId?: string;
};

export class GateEnforcer {
  constructor(private readonly opts: GateEnforcerOptions) {}

  async check(
    graph: WorkflowGraph,
    options: GateCheckOptions = {},
  ): Promise<GateCheckResult> {
    const failures: GateFailure[] = [];

    for (const rel of graph.externalInputs) {
      const abs = isAbsolute(rel) ? rel : resolve(this.opts.repoRoot, rel);
      if (!existsSync(abs)) {
        failures.push({
          kind: 'missing-input',
          message: `required input not found: ${rel}`,
          path: rel,
        });
        continue;
      }
      const status = readFrontmatterField(abs, 'status');
      if (status !== 'approved') {
        failures.push({
          kind: 'unapproved-input',
          message: `input ${rel} has status='${status ?? 'none'}' (need 'approved')`,
          path: rel,
        });
      }
    }

    if (options.previousWorkflowId) {
      const succeeded = this.opts.runs.listRuns({
        workflow_id: options.previousWorkflowId,
        status: 'succeeded',
        limit: 1,
      });
      if (succeeded.length === 0) {
        failures.push({
          kind: 'previous-not-succeeded',
          message: `no successful run found for prerequisite workflow '${options.previousWorkflowId}'`,
          workflowId: options.previousWorkflowId,
        });
      }
    }

    return { ok: failures.length === 0, failures };
  }
}

/**
 * Minimal YAML frontmatter reader — top of file between two `---` fences.
 * Returns null if no frontmatter or field absent. Intentionally not a full
 * YAML parser; values are read as raw strings up to the first newline.
 */
function readFrontmatterField(path: string, field: string): string | null {
  let body: string;
  try {
    body = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  if (!body.startsWith('---')) return null;
  const end = body.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = body.slice(3, end);
  const lines = block.split('\n');
  const prefix = `${field}:`;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}
