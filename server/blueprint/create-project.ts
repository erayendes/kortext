import { resolveBlueprintPaths, type ProjectMeta } from './io.ts';

export type CreateProjectInput = {
  projectDir: string;
  meta: ProjectMeta;
  blueprintBody: string;
};

// These are deliberately NARROWED adapter views of the real implementations,
// not their full signatures — the wiring step (server/index.ts) adapts the real
// fns to these shapes. Kept narrow so this module stays pure + unit-testable:
//   - init        ← adapts initCommand(InitCommandInput)        (server/cli/init.ts)
//   - startProject← adapts startProject(arg, StartDeps): StartResult (server/cli/cmd-start.ts)
//   - bootstrapGit← adapts bootstrapGit(dir): BootstrapGitResult (server/cli/bootstrap-git.ts)
export type CreateProjectDeps = {
  packageRoot: string;
  init: (dir: string) => { ok: boolean; errorMessage?: string };
  bootstrapGit: (dir: string) => { ok: boolean; warning?: string };
  startProject: (
    dir: string,
    deps: { packageRoot: string; cwd: string },
  ) =>
    | { ok: true; url: string; slug: string; port: number }
    | { ok: false; message: string };
  writeBlueprint: (path: string, input: { blueprintBody: string }) => void;
  writeProjectMeta: (path: string, meta: ProjectMeta) => void;
};

export type CreateProjectResult =
  | { ok: true; handoffUrl: string; projectDir: string; gitWarning?: string }
  | { ok: false; message: string };

/**
 * Materialize a brand-new project in `projectDir` and launch its own daemon.
 * Order matters: scaffold (.kortext must exist) → git → write BRD+meta →
 * spawn daemon. The spawned daemon auto-starts analysis on boot
 * (see autoStartPendingAnalysis), so no trigger happens here.
 */
export function createProjectAndLaunch(
  input: CreateProjectInput,
  deps: CreateProjectDeps,
): CreateProjectResult {
  const { projectDir, meta, blueprintBody } = input;

  const scaffold = deps.init(projectDir);
  if (!scaffold.ok) {
    return { ok: false, message: scaffold.errorMessage ?? 'scaffold failed' };
  }

  const git = deps.bootstrapGit(projectDir);
  const gitWarning = git.ok ? undefined : git.warning;

  const paths = resolveBlueprintPaths(projectDir);
  deps.writeBlueprint(paths.blueprintPath, { blueprintBody });
  deps.writeProjectMeta(paths.projectJsonPath, meta);

  const launched = deps.startProject(projectDir, {
    packageRoot: deps.packageRoot,
    cwd: projectDir,
  });
  if (!launched.ok) {
    return { ok: false, message: launched.message };
  }

  return { ok: true, handoffUrl: launched.url, projectDir, gitWarning };
}
