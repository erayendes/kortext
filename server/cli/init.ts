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
 * v3.1 encapsulation: the project gets the `.kortext/` framework folder
 * (think `.git/`) plus a handful of root-level files that AI tools and node
 * conventions expect at the top (`AGENTS.md`, `.gitignore`, `.env.example`).
 *
 * The runtime sources for personas, workflows, and rules now live inside
 * the npm package itself (`<paket-kökü>/agents`, `/workflows`, `/rules`)
 * and are loaded directly from there — they are NOT copied per-project.
 *
 * Init copies:
 *   - root templates: AGENTS.md, .gitignore, .env.example
 *   - `.kortext/references/`, `.kortext/reports/`, `.kortext/memory/`
 *     (seeded from `<paket-kökü>/templates/` when present)
 *   - `.kortext/data/` (empty; SQLite + worktrees + logs land here at runtime)
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

/**
 * Directories scaffolded under `.kortext/`. Each one is seeded from
 * `<paket-kökü>/templates/<name>/` when that exists; otherwise the empty
 * directory is created so the engine has something to write into at
 * runtime.
 */
const KORTEXT_SCAFFOLD_DIRS = ['references', 'reports', 'memory'] as const;

/** Root-level files copied verbatim from `<paket-kökü>/templates/`. */
const ROOT_TEMPLATE_FILES = ['AGENTS.md', '.gitignore', '.env.example'] as const;

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

- \`.kortext/references/blueprint.md\` — product blueprint; approving it
  triggers the analysis → planning → development pipeline chain
- \`.kortext/references/\` — team-shared references (auth, db schema, …)
- \`.kortext/reports/\` — per-file engine + persona reports
- \`.kortext/memory/\` — handover.md, decisions.md, learned.md
- \`.kortext/data/\` — SQLite + worktrees + raw logs (git-ignored)

Persona, workflow, and rule definitions live inside the kortext npm
package itself and are loaded directly from there — no per-project copy.
`;

const DEFAULT_GITIGNORE = `.kortext/data/
.env
node_modules/
.DS_Store
`;

const DEFAULT_ENV_EXAMPLE = `# Kortext environment variables. Copy to .env and fill in real values.
# See _docbase/kortext/docs/internal/v3.1-architecture-proposal.md for details.

# Where the engine will spawn the dashboard + REST API.
KORTEXT_PORT=3200

# Optional notification webhooks (see server/notifications/).
# SLACK_WEBHOOK_URL=
# SLACK_CHANNEL=
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=
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

function copyTemplateDirInto(
  templateRoot: string,
  targetRoot: string,
  /** Path *within* `<paket-kökü>/templates/`, e.g. `references`. */
  templateRel: string,
  /** Path *within* the target project, e.g. `.kortext/references`. */
  targetRel: string,
  force: boolean,
  created: string[],
  skipped: string[],
): void {
  const source = join(templateRoot, 'templates', templateRel);
  const target = join(targetRoot, targetRel);

  if (existsSync(target) && !force) {
    skipped.push(targetRel);
    return;
  }

  if (existsSync(source)) {
    cpSync(source, target, { recursive: true, force });
    created.push(targetRel);
    return;
  }

  // Templates directory missing or no seed for this subdir — create an empty
  // dir so the engine has something to write into later. Faz 12.3 will
  // populate `<paket-kökü>/templates/` with real seeds; until then this is
  // the graceful fallback.
  mkdirSync(target, { recursive: true });
  created.push(targetRel);
}

function copyRootTemplateFile(
  templateRoot: string,
  targetRoot: string,
  filename: string,
  fallbackContent: string,
  force: boolean,
  created: string[],
  skipped: string[],
): void {
  const targetPath = join(targetRoot, filename);
  if (existsSync(targetPath) && !force) {
    skipped.push(filename);
    return;
  }
  const sourcePath = join(templateRoot, 'templates', filename);
  const content = existsSync(sourcePath)
    ? readFileSync(sourcePath, 'utf8')
    : fallbackContent;
  writeFileSync(targetPath, content, 'utf8');
  created.push(filename);
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

  // 1. Root-level template files (AGENTS.md, .gitignore, .env.example).
  //    Each falls back to a built-in default when the template is missing
  //    (Faz 12.3 will replace these defaults with the canonical templates).
  const ROOT_FALLBACKS: Record<string, string> = {
    'AGENTS.md': DEFAULT_AGENTS_MD,
    '.gitignore': DEFAULT_GITIGNORE,
    '.env.example': DEFAULT_ENV_EXAMPLE,
  };
  for (const filename of ROOT_TEMPLATE_FILES) {
    copyRootTemplateFile(
      templatesDir,
      targetDir,
      filename,
      ROOT_FALLBACKS[filename] ?? '',
      force,
      created,
      skipped,
    );
  }

  // 2. `.kortext/<scaffold>` directories (references / reports / memory).
  for (const rel of KORTEXT_SCAFFOLD_DIRS) {
    copyTemplateDirInto(
      templatesDir,
      targetDir,
      rel,
      join('.kortext', rel),
      force,
      created,
      skipped,
    );
  }

  // 3. `.kortext/data/` — SQLite + worktrees + logs live here. Empty on
  //    init; engine creates subdirs as needed.
  const dataDir = join(targetDir, '.kortext', 'data');
  const dataRel = join('.kortext', 'data');
  if (existsSync(dataDir) && !force) {
    skipped.push(dataRel);
  } else {
    mkdirSync(dataDir, { recursive: true });
    created.push(dataRel);
  }

  // 4. DB + migrations.
  const dbPath = join(dataDir, 'kortext.db');
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
