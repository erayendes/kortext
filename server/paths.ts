import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Path helpers used by server boot and CLI commands.
 *
 * v3.1 encapsulation:
 *   - Persona / workflow / rule definitions live INSIDE the npm package
 *     (`<paket-kökü>/agents`, `/workflows`, `/rules`) and are loaded directly
 *     from there. No per-project copy.
 *   - Per-project data lives under `.kortext/` in the project root:
 *       .kortext/data/          → SQLite + worktrees + raw logs (git-ignored)
 *       .kortext/foundation/    → BRD/PRD/TRD/PFD (Faz 13: produced once
 *                                 during analysis, then frozen — never
 *                                 read as input by later workflows)
 *       .kortext/references/    → team-shared living references (ALL-CAPS
 *                                 filenames: ACCESS.md, API.md, ...)
 *       .kortext/reports/       → per-file run-specific reports
 *                                 (<scope>_<slug>_<ts>.md)
 *       .kortext/memory/        → handover.md, decisions.md, learned.md
 */

/**
 * Walk up from this file until we find a `package.json`. Returns the
 * directory containing it.
 *
 * The walk-up handles both runtime modes:
 *   - source: this file lives at `server/paths.ts`, package.json one level up
 *   - compiled: this file lives at `dist/server/paths.js`, package.json two
 *     levels up
 *
 * When `name` is provided, we also verify that the package.json's `name`
 * field matches — so a transitively installed copy of kortext under a host
 * project's `node_modules/` doesn't accidentally resolve the host's root.
 */
export function packageRoot(name?: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let cursor = here;
  for (let i = 0; i < 8; i++) {
    const pkgPath = join(cursor, 'package.json');
    if (existsSync(pkgPath)) {
      if (!name) return cursor;
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          name?: string;
        };
        if (pkg.name === name) return cursor;
      } catch {
        // fall through to walk-up
      }
    }
    const parent = resolve(cursor, '..');
    if (parent === cursor) break;
    cursor = parent;
  }
  // Last-ditch: assume source layout.
  return resolve(here, '..');
}

/**
 * Project-side `.kortext/` layout. All paths are absolute, anchored at
 * `projectRoot` (typically `process.cwd()` on the server, or a temp dir in
 * tests).
 */
export type ProjectLayout = {
  root: string;
  dotKortext: string;
  data: string;
  foundation: string;
  references: string;
  reports: string;
  memory: string;
  worktrees: string;
  worktreesQuarantine: string;
};

export function projectLayout(projectRoot: string): ProjectLayout {
  const root = resolve(projectRoot);
  const dotKortext = join(root, '.kortext');
  return {
    root,
    dotKortext,
    data: join(dotKortext, 'data'),
    foundation: join(dotKortext, 'foundation'),
    references: join(dotKortext, 'references'),
    reports: join(dotKortext, 'reports'),
    memory: join(dotKortext, 'memory'),
    worktrees: join(dotKortext, 'data', 'worktrees'),
    worktreesQuarantine: join(dotKortext, 'data', 'worktrees-quarantine'),
  };
}

/**
 * Global runtime layout: where the engine reads persona/workflow/rule
 * definitions from. Resolved from the npm package itself, not the project.
 */
export type RuntimeLayout = {
  packageRoot: string;
  agentsDir: string;
  workflowsDir: string;
  rulesDir: string;
  templatesDir: string;
};

export function runtimeLayout(pkgRoot?: string): RuntimeLayout {
  const root = pkgRoot ?? packageRoot('kortext');
  return {
    packageRoot: root,
    agentsDir: join(root, 'agents'),
    workflowsDir: join(root, 'workflows'),
    rulesDir: join(root, 'rules'),
    templatesDir: join(root, 'templates'),
  };
}
