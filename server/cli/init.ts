import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db/client.ts';

/**
 * `kortext init` — scaffold a fresh project so the orchestrator can run.
 *
 * Idempotent: per-entry checks skip anything already on disk unless `force`
 * is true. Returns a list of created vs skipped paths (relative to target)
 * for the CLI to render — no console.log here so the command stays
 * unit-testable.
 */

export type InitCommandInput = {
  targetDir: string;
  /** Override for tests. Defaults to the package root resolved from this file. */
  templatesDir?: string;
  force?: boolean;
};

export type InitCommandResult =
  | {
      ok: true;
      created: string[];
      skipped: string[];
      dbPath: string;
      schemaVersion: number;
    }
  | { ok: false; errorMessage: string };

const SCAFFOLD_DIRS = ['agents', 'workflows', 'rules', 'workspace'] as const;

const DEFAULT_AGENTS_MD = `# AGENTS.md

> Kortext v3 — autonomous AI agent runtime. Run \`kortext serve\` to launch
> the dashboard + backend, or \`kortext mcp\` to expose tools over MCP.

## Quick start

\`\`\`bash
kortext serve     # backend + dashboard (default port 3200)
kortext status    # recent runs + open approval questions
kortext logs      # tail of the audit log
kortext doctor    # workflow / persona / lock consistency scan
\`\`\`

## Where things live

- \`agents/\` — persona definitions (one markdown file per role)
- \`workflows/\` — pipeline definitions, executed via the worker pool
- \`rules/\` — project-wide behavior, branching, commands, models, emergency
- \`workspace/references/blueprint.md\` — product blueprint; approving it
  triggers the analysis → planning → development pipeline chain
- \`.kortext/runtime/kortext.db\` — SQLite state (runs, items, audit log)
`;

function packageRootFromHere(): string {
  // Source path is `server/cli/init.ts` (root two levels up). Compiled path is
  // `dist/server/cli/init.js` (root three levels up). Walking up until we find
  // a package.json keeps both layouts working without special-casing — the same
  // pattern bin/kortext.ts uses for version reporting.
  const here = dirname(fileURLToPath(import.meta.url));
  let cursor = here;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(cursor, 'package.json'))) return cursor;
    const parent = resolve(cursor, '..');
    if (parent === cursor) break;
    cursor = parent;
  }
  return resolve(here, '..', '..');
}

function copyTemplateDir(
  sourceRoot: string,
  targetRoot: string,
  relPath: string,
  force: boolean,
  created: string[],
  skipped: string[],
): void {
  const source = join(sourceRoot, relPath);
  const target = join(targetRoot, relPath);
  if (!existsSync(source)) {
    // Templates dir lacks this entry — nothing to scaffold.
    return;
  }
  if (existsSync(target) && !force) {
    skipped.push(relPath);
    return;
  }
  cpSync(source, target, { recursive: true, force });
  created.push(relPath);
}

export function initCommand(input: InitCommandInput): InitCommandResult {
  const targetDir = resolve(input.targetDir);
  const templatesDir = resolve(input.templatesDir ?? packageRootFromHere());

  if (resolve(templatesDir) === targetDir && !input.force) {
    return {
      ok: false,
      errorMessage:
        'refusing to init into the templates directory itself (use --force to override)',
    };
  }

  mkdirSync(targetDir, { recursive: true });

  const created: string[] = [];
  const skipped: string[] = [];
  const force = input.force === true;

  for (const rel of SCAFFOLD_DIRS) {
    copyTemplateDir(templatesDir, targetDir, rel, force, created, skipped);
  }

  // AGENTS.md: prefer the template's copy when present, otherwise write a
  // minimal default so `claude` / `codex` agents can discover the project.
  const agentsMdPath = join(targetDir, 'AGENTS.md');
  if (existsSync(agentsMdPath) && !force) {
    skipped.push('AGENTS.md');
  } else {
    const templateAgentsMd = join(templatesDir, 'AGENTS.md');
    const content = existsSync(templateAgentsMd)
      ? readFileSync(templateAgentsMd, 'utf8')
      : DEFAULT_AGENTS_MD;
    writeFileSync(agentsMdPath, content, 'utf8');
    created.push('AGENTS.md');
  }

  // Runtime dir + DB (migrations run inside openDb).
  const runtimeDir = join(targetDir, '.kortext', 'runtime');
  mkdirSync(runtimeDir, { recursive: true });

  const dbPath = join(runtimeDir, 'kortext.db');
  const dbExisted = existsSync(dbPath);

  let schemaVersion = 0;
  try {
    const bundle = openDb({ path: dbPath });
    schemaVersion = bundle.schemaVersion;
    bundle.db.close();
  } catch (err) {
    return {
      ok: false,
      errorMessage: `db init failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (dbExisted) {
    skipped.push(relative(targetDir, dbPath));
  } else {
    created.push(relative(targetDir, dbPath));
  }

  return {
    ok: true,
    created,
    skipped,
    dbPath,
    schemaVersion,
  };
}
