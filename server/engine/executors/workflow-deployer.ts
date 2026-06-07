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
};

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
   * Deploy to production — the mechanical `development→main` merge + prod deploy + tag (§5.11).
   * Real git main-merge / tag is a follow-up; mock-first now (mirrors deployStaging pattern).
   */
  async deployProd(ctx: ProdDeployContext): Promise<DeployOutcome> {
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
