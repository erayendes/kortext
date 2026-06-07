import { execFileSync } from 'node:child_process';
import type { Deployer, DeployContext, DeployOutcome, PreprodDeployContext, ProdDeployContext } from '../deployer.ts';
import type { Repositories } from '../../db/repositories/index.ts';
import type { Executor } from '../executor.ts';
import type { WorkflowDefinition } from '../workflow-parser.ts';
import type { RunRegistry } from '../run-registry.ts';
import { buildGraph } from '../dag.ts';
import { runWorkflow } from '../worker-pool.ts';

export type WorkflowDeployerDeps = {
  repos: Repositories;
  /** Agent substrate the deployment-cycle steps run on (real CLI executor; mocked in tests). */
  executor: Executor;
  /** Resolve the deployment-cycle workflow definition. null when it can't be found. */
  loadDeploymentWorkflow: () => WorkflowDefinition | null;
  /** Optional cancellation registry so a deploy run can be blocked (W1). */
  registry?: RunRegistry;
  /**
   * Absolute path to the git repo root (directory containing .git).
   * When set, `deployProd` performs the REAL `development→main` merge + annotated
   * version tag instead of the workflow/no-op path.
   * When absent, the prior workflow-driven behavior is kept (existing tests still pass).
   */
  repoRoot?: string;
};

// ---------------------------------------------------------------------------
// Local git helper — shell-free, safe against metacharacter injection.
// ---------------------------------------------------------------------------

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Real production release: merge `development` into `main` and create an
 * annotated version tag. No `git push` — CI/prod-push is a documented follow-up.
 *
 * Git sequence (idempotent):
 *   1. Tag exists already → already released, return ok immediately.
 *   2. `development` must exist → else error.
 *   3. `main` missing → create it from development (first release).
 *   4. development already an ancestor of main → tag only (if missing), return ok.
 *   5. `git checkout main` + `git merge --no-ff … development`.
 *   6. `git tag -a <version> -m "Release <version>"`.
 *   7. On ANY merge throw → `git merge --abort` (best-effort), return conflict error.
 */
async function gitProdRelease(repoRoot: string, version: string): Promise<DeployOutcome> {
  // 1. Idempotency: tag already exists → already released.
  try {
    git(repoRoot, 'rev-parse', '--verify', `refs/tags/${version}`);
    return { ok: true, url: null };
  } catch {
    // tag does not exist — continue
  }

  // 2. development must exist.
  try {
    git(repoRoot, 'rev-parse', '--verify', 'refs/heads/development');
  } catch {
    return { ok: false, reason: 'development branch not found' };
  }

  // Capture the branch we start on so we can restore it before returning — the
  // server is long-running and other components expect to find the working tree
  // on `development`, not the `main` we're about to check out. Detached HEAD →
  // null (nothing to restore to a named branch).
  let originalBranch: string | null = null;
  try {
    originalBranch = git(repoRoot, 'symbolic-ref', '--short', 'HEAD') || null;
  } catch {
    originalBranch = null; // detached HEAD
  }

  // Restore the original branch (best-effort) — only when it was a real branch
  // other than the `main` we may already be on.
  const restoreBranch = () => {
    if (!originalBranch || originalBranch === 'main') return;
    try {
      git(repoRoot, 'checkout', originalBranch);
    } catch {
      // best-effort — leave the tree where it is rather than throw on cleanup
    }
  };

  // 3. Ensure main: create from development if it doesn't exist yet (first release).
  let mainExists = false;
  try {
    git(repoRoot, 'rev-parse', '--verify', 'refs/heads/main');
    mainExists = true;
  } catch {
    git(repoRoot, 'branch', 'main', 'development');
  }

  // 4. If development is already an ancestor of main → skip merge, just tag.
  if (mainExists) {
    const isAncestor = (() => {
      try {
        git(repoRoot, 'merge-base', '--is-ancestor', 'development', 'main');
        return true;
      } catch {
        return false;
      }
    })();

    if (isAncestor) {
      // Tag still needed (tag existence already checked above).
      try {
        git(repoRoot, 'checkout', 'main');
        git(repoRoot, 'tag', '-a', version, '-m', `Release ${version}`);
      } catch (e) {
        restoreBranch();
        return { ok: false, conflict: false, reason: e instanceof Error ? e.message : String(e) };
      }
      restoreBranch();
      return { ok: true, url: null };
    }
  }

  // 5–6. Checkout main → merge --no-ff → tag. Track which step is running so a
  // checkout/tag failure is NOT mislabelled as a merge conflict — only a failure
  // of the `git merge` itself sets conflict:true (and triggers `merge --abort`).
  let step: 'checkout' | 'merge' | 'tag' = 'checkout';
  try {
    git(repoRoot, 'checkout', 'main');
    step = 'merge';
    git(
      repoRoot,
      'merge',
      '--no-ff',
      '-m',
      `Release ${version}: merge development into main`,
      'development',
    );
    step = 'tag';
    git(repoRoot, 'tag', '-a', version, '-m', `Release ${version}`);
    git(repoRoot, 'rev-parse', 'HEAD'); // capture HEAD (could surface in logs)
    // NOTE: prod push is intentionally omitted — CI/prod-push is a follow-up.
    restoreBranch();
    return { ok: true, url: null };
  } catch (e) {
    // Only a merge failure is a conflict; a checkout/tag failure is not. Abort
    // the merge (best-effort) only when one was actually in progress.
    if (step === 'merge') {
      try {
        git(repoRoot, 'merge', '--abort');
      } catch {
        // best-effort — already in a clean state or no merge in progress
      }
    }
    restoreBranch();
    return {
      ok: false,
      conflict: step === 'merge',
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Real {@link Deployer} (capstone C4) — the staging deploy IS the deployment-cycle
 * workflow run (§5.11: develop→staging, persona reports, prime approval). Rather
 * than hard-code "what staging is" (project-specific), this drives that workflow
 * through the engine; the agents in its steps perform the actual deploy.
 *
 * epic done → a deployment-cycle run for the epic → run succeeded = ok; failed =
 * not-ok with the failure reason. No workflow resolvable → ok:false (no run).
 */
export class WorkflowDeployer implements Deployer {
  readonly name = 'workflow-deployer';

  constructor(private readonly deps: WorkflowDeployerDeps) {}

  async deployStaging(ctx: DeployContext): Promise<DeployOutcome> {
    const def = this.deps.loadDeploymentWorkflow();
    if (!def) {
      return { ok: false, reason: 'deployment-cycle workflow not found' };
    }

    const graph = buildGraph(def);
    const result = await runWorkflow(graph, this.deps.executor, this.deps.repos, {
      triggeredBy: `deploy:staging:epic:${ctx.epicId}`,
      registry: this.deps.registry,
    });

    if (result.run.status === 'succeeded') {
      return { ok: true };
    }
    return { ok: false, reason: result.run.error_message ?? 'staging deploy run did not succeed' };
  }

  async deployPreprod(ctx: PreprodDeployContext): Promise<DeployOutcome> {
    const def = this.deps.loadDeploymentWorkflow();
    if (!def) {
      return { ok: false, reason: 'preprod-deployment-cycle workflow not found' };
    }

    const graph = buildGraph(def);
    const result = await runWorkflow(graph, this.deps.executor, this.deps.repos, {
      triggeredBy: `deploy:preprod:version:${ctx.version}`,
      registry: this.deps.registry,
    });

    if (result.run.status === 'succeeded') {
      return { ok: true };
    }
    return { ok: false, reason: result.run.error_message ?? 'preprod deploy run did not succeed' };
  }

  /**
   * Deploy to production — the mechanical `development→main` merge + annotated tag (§5.11).
   *
   * When `repoRoot` is supplied in deps, performs the REAL git merge + tag
   * (`gitProdRelease`). No `git push` — CI/prod-push is a documented follow-up.
   *
   * When `repoRoot` is absent, falls back to the prior workflow/no-op path so that
   * all existing tests that do NOT supply repoRoot continue to pass.
   */
  async deployProd(ctx: ProdDeployContext): Promise<DeployOutcome> {
    if (this.deps.repoRoot) {
      return gitProdRelease(this.deps.repoRoot, ctx.version);
    }

    // Fallback: workflow-driven path (mock-first, kept for backward-compat).
    const def = this.deps.loadDeploymentWorkflow();
    if (!def) {
      return { ok: false, reason: 'prod-deployment-cycle workflow not found' };
    }

    const graph = buildGraph(def);
    const result = await runWorkflow(graph, this.deps.executor, this.deps.repos, {
      triggeredBy: `deploy:prod:version:${ctx.version}`,
      registry: this.deps.registry,
    });

    if (result.run.status === 'succeeded') {
      return { ok: true };
    }
    return { ok: false, reason: result.run.error_message ?? 'prod deploy run did not succeed' };
  }
}
