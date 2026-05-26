import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type BlueprintStatus = 'uninitialized' | 'draft' | 'approved' | 'unknown';

export type ProjectType = 'new' | 'existing';

export type ExecutorChoice = 'mock' | 'claude' | 'antigravity';

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
      const exec: ExecutorChoice =
        parsed.executor === 'claude' || parsed.executor === 'antigravity'
          ? parsed.executor
          : 'mock';
      return {
        name: parsed.name,
        code: parsed.code,
        type: parsed.type,
        platforms: parsed.platforms.filter((p): p is string => typeof p === 'string'),
        githubRepo: typeof parsed.githubRepo === 'string' ? parsed.githubRepo : null,
        executor: exec,
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
  return type === 'new' ? '01a-analysis-pipeline' : '01b-onboarding-pipeline';
}
