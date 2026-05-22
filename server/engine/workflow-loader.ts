import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadWorkflowFromFile,
  type WorkflowDefinition,
} from './workflow-parser.ts';

/**
 * Directory-level workflow loader.
 *
 * Wraps the single-file parser with a registry view: scan a directory of
 * `*.md` files, parse each, and expose them as id → definition lookup plus
 * a list of per-file errors. Used by server boot and `kortext start` to
 * resolve workflow ids against real markdown sources instead of inline
 * test fixtures.
 */

export type WorkflowLoadError = {
  /** Filename relative to the scanned directory (e.g. 'empty.md'). */
  file: string;
  /** Human-readable reason — surfaced by `kortext doctor` in Faz 5.5. */
  reason: string;
};

export type WorkflowRegistry = {
  /** Returns the parsed workflow for an id (filename stem), or null. */
  get(id: string): WorkflowDefinition | null;
  /** All successfully loaded workflows. */
  list(): WorkflowDefinition[];
  /** Files that failed to load — empty when everything is healthy. */
  errors(): WorkflowLoadError[];
};

/**
 * Scan `dir` and build a registry of workflows.
 *
 * - Only `*.md` files at the top level are considered (no recursion).
 * - Files that parse to zero steps are treated as malformed: they go to
 *   `errors()` and are NOT included in `list()`/`get()`.
 * - A non-existent directory throws — this is a config bug, not an
 *   operational error.
 */
export function loadWorkflowsFromDir(dir: string): WorkflowRegistry {
  // statSync throws ENOENT for missing dirs — that's the contract.
  const dirStat = statSync(dir);
  if (!dirStat.isDirectory()) {
    throw new Error(`workflow loader: not a directory: ${dir}`);
  }

  const definitions = new Map<string, WorkflowDefinition>();
  const errors: WorkflowLoadError[] = [];

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;

    const fullPath = join(dir, entry.name);
    try {
      const def = loadWorkflowFromFile(fullPath);
      if (def.steps.length === 0) {
        errors.push({ file: entry.name, reason: 'no steps parsed (empty workflow)' });
        continue;
      }
      definitions.set(def.id, def);
    } catch (err) {
      errors.push({
        file: entry.name,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    get(id) {
      return definitions.get(id) ?? null;
    },
    list() {
      return [...definitions.values()];
    },
    errors() {
      return [...errors];
    },
  };
}
