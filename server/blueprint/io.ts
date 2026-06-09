import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type BlueprintStatus = 'uninitialized' | 'draft' | 'approved' | 'unknown';

export type ProjectType = 'new' | 'existing';

export type ExecutorChoice = 'mock' | 'claude' | 'codex' | 'antigravity';

// Executors onboarding offers. Gemini is engine-supported (see ExecutorKind in
// cli/executor-factory.ts) but intentionally not exposed in the wizard yet.
const EXECUTOR_CHOICES: readonly ExecutorChoice[] = [
  'mock',
  'claude',
  'codex',
  'antigravity',
];

/** Normalize an untrusted executor value to a valid choice; unknown → 'mock'. */
export function normalizeExecutor(raw: unknown): ExecutorChoice {
  return EXECUTOR_CHOICES.includes(raw as ExecutorChoice)
    ? (raw as ExecutorChoice)
    : 'mock';
}

export type ProjectMeta = {
  name: string;
  code: string;
  type: ProjectType;
  platforms: string[];
  githubRepo: string | null;
  executor: ExecutorChoice;
  /**
   * Ordered fallback chain (UAT #10). The primary executor sits first; when it
   * recoverably fails (quota / 429 / rate-limit / empty-output) the engine falls
   * over to the next. Optional for back-compat — when absent the chain is just
   * `[executor]`. Use {@link executorChain} to read the effective ordered list.
   */
  executors?: ExecutorChoice[];
  executorBinary: string | null;
  createdAt: number;
};

/**
 * The effective ordered executor chain for a project (UAT #10). Returns the
 * explicit `executors` priority list when set and non-empty; otherwise the
 * single `executor` as a one-element chain (back-compat).
 */
export function executorChain(meta: ProjectMeta): ExecutorChoice[] {
  if (meta.executors && meta.executors.length > 0) return meta.executors;
  return [meta.executor];
}

export type BlueprintPaths = {
  workspaceRoot: string;
  blueprintPath: string;
  projectJsonPath: string;
};

// Faz 13: blueprint is the Business Requirements Document (BRD) — first
// of the four foundation documents (BRD/PRD/TRD/PFD). Lives under
// `.kortext/foundation/`, not `.kortext/references/`, so it's not co-
// mingled with the living references the team keeps editing post-analysis.
const DEFAULT_BLUEPRINT_REL = '.kortext/foundation/BRD.md';
const DEFAULT_PROJECT_JSON_REL = '.kortext/project.json';

export function resolveBlueprintPaths(workspaceRoot: string): BlueprintPaths {
  const root = resolve(workspaceRoot);
  return {
    workspaceRoot: root,
    blueprintPath: join(root, DEFAULT_BLUEPRINT_REL),
    projectJsonPath: join(root, DEFAULT_PROJECT_JSON_REL),
  };
}

export type BlueprintTarget = {
  root: string;
  paths: BlueprintPaths;
  /** True when the target differs from the running daemon's workspace. */
  isElsewhere: boolean;
};

/**
 * Resolve where to write the project: the daemon's own workspace by default, or
 * a user-chosen `projectDir`. When `isElsewhere` is true the caller writes the
 * files but skips the workflow trigger — that folder's own daemon picks it up
 * when started there (Model A: "create here, then run Kortext there").
 */
export function resolveBlueprintTarget(
  projectDir: string | null | undefined,
  workspaceRoot: string,
): BlueprintTarget {
  const daemonRoot = resolve(workspaceRoot);
  const trimmed = typeof projectDir === 'string' ? projectDir.trim() : '';
  if (trimmed.length === 0) {
    return { root: daemonRoot, paths: resolveBlueprintPaths(daemonRoot), isElsewhere: false };
  }
  const target = resolve(trimmed);
  return {
    root: target,
    paths: resolveBlueprintPaths(target),
    isElsewhere: target !== daemonRoot,
  };
}

export function readBlueprintStatus(blueprintPath: string): BlueprintStatus {
  if (!existsSync(blueprintPath)) return 'uninitialized';
  let body: string;
  try {
    body = readFileSync(blueprintPath, 'utf8');
  } catch {
    return 'unknown';
  }
  if (!body.startsWith('---')) return 'unknown';
  const end = body.indexOf('\n---', 3);
  if (end < 0) return 'unknown';
  const block = body.slice(3, end);
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('status:')) {
      const value = line.slice('status:'.length).trim().replace(/^['"]|['"]$/g, '');
      if (value === 'uninitialized' || value === 'draft' || value === 'approved') {
        return value;
      }
      return 'unknown';
    }
  }
  return 'unknown';
}

export type WriteBlueprintInput = {
  blueprintBody: string;
  owner?: string;
};

export function writeBlueprint(
  blueprintPath: string,
  input: WriteBlueprintInput,
): void {
  const owner = input.owner ?? '+prime';
  const today = new Date().toISOString().slice(0, 10);
  const body = stripExistingFrontmatter(input.blueprintBody);
  const frontmatter = [
    '---',
    'status: approved',
    `owner: ${owner}`,
    `last_review: ${today}`,
    '---',
    '',
  ].join('\n');
  mkdirSync(dirname(blueprintPath), { recursive: true });
  writeFileSync(blueprintPath, frontmatter + body.trimStart() + '\n', 'utf8');
}

function stripExistingFrontmatter(body: string): string {
  if (!body.startsWith('---')) return body;
  const end = body.indexOf('\n---', 3);
  if (end < 0) return body;
  return body.slice(end + 4);
}

export function readProjectMeta(projectJsonPath: string): ProjectMeta | null {
  if (!existsSync(projectJsonPath)) return null;
  try {
    const raw = readFileSync(projectJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProjectMeta>;
    if (
      typeof parsed.name === 'string' &&
      typeof parsed.code === 'string' &&
      (parsed.type === 'new' || parsed.type === 'existing') &&
      Array.isArray(parsed.platforms) &&
      typeof parsed.createdAt === 'number'
    ) {
      const exec: ExecutorChoice = normalizeExecutor(parsed.executor);
      // UAT #10: optional ordered fallback chain. Validate each entry via
      // normalizeExecutor and DROP invalids (normalizeExecutor maps unknowns to
      // 'mock', so we re-check membership against the raw value to drop rather
      // than silently rewrite to mock). Absent or fully-invalid → undefined, so
      // executorChain() falls back to the single `executor`.
      let executors: ExecutorChoice[] | undefined;
      if (Array.isArray(parsed.executors)) {
        const valid = parsed.executors.filter(
          (e): e is ExecutorChoice =>
            typeof e === 'string' && EXECUTOR_CHOICES.includes(e as ExecutorChoice),
        );
        executors = valid.length > 0 ? valid : undefined;
      }
      return {
        name: parsed.name,
        code: parsed.code,
        type: parsed.type,
        platforms: parsed.platforms.filter((p): p is string => typeof p === 'string'),
        githubRepo: typeof parsed.githubRepo === 'string' ? parsed.githubRepo : null,
        executor: exec,
        ...(executors ? { executors } : {}),
        executorBinary:
          typeof parsed.executorBinary === 'string' ? parsed.executorBinary : null,
        createdAt: parsed.createdAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeProjectMeta(projectJsonPath: string, meta: ProjectMeta): void {
  mkdirSync(dirname(projectJsonPath), { recursive: true });
  writeFileSync(projectJsonPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

export function triggerWorkflowIdFor(type: ProjectType): string {
  return type === 'new' ? 'new-project-analysis' : 'existing-project-analysis';
}
