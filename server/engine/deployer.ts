/**
 * Deploy abstraction — the staging-trigger substrate for epic completion (§5.9 #8).
 *
 * Division of labour (§5.1 turnusol): the engine owns the *detection* (is the
 * epic complete?) and the *trigger timing*; the Deployer owns the deploy
 * substrate — push `development` to the staging environment (test data, §5.11).
 * The real implementation drives the deployment-cycle; tests inject a MockDeployer.
 * Gate-persona staging reports and the prime staging-approval (§5.11) are deferred
 * (TODO §5.9) — this is just the trigger.
 */

export type DeployContext = {
  epicId: string;
  /** Aborted when the surrounding run is cancelled. Implementations SHOULD honour it. */
  signal?: AbortSignal;
};

/** Context for a pre-production deployment (version-level, after all epics staging-approved). */
export type PreprodDeployContext = {
  version: string;
  /** Aborted when the surrounding run is cancelled. Implementations SHOULD honour it. */
  signal?: AbortSignal;
};

/**
 * Context for a production deployment (version-level, after preprod-approval).
 * Represents the mechanical `development→main` merge + prod deploy + tag step (§5.11).
 * Real git main-merge / tag is a follow-up; mock-first now.
 */
export type ProdDeployContext = {
  version: string;
  /** Aborted when the surrounding run is cancelled. Implementations SHOULD honour it. */
  signal?: AbortSignal;
};

export type DeployOutcome = {
  ok: boolean;
  /** Staging URL on success. */
  url?: string | null;
  /** Why the deploy failed. */
  reason?: string | null;
  /** True when a merge conflict (not a general failure) blocked the deploy. */
  conflict?: boolean;
};

export interface Deployer {
  /** Stable name for logs/audit, e.g. 'mock-deployer', 'staging-deployer'. */
  readonly name: string;
  /** Deploy the completed epic's integration branch to staging. */
  deployStaging(ctx: DeployContext): Promise<DeployOutcome>;
  /** Deploy the version to pre-production (fires before the preprod-approval question). */
  deployPreprod(ctx: PreprodDeployContext): Promise<DeployOutcome>;
  /**
   * Deploy the version to production — the mechanical `development→main` merge +
   * prod deploy + tag (§5.11). Real git main-merge/tag is a follow-up; mock-first now.
   */
  deployProd(ctx: ProdDeployContext): Promise<DeployOutcome>;
}
