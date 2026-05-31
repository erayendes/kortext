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

export type DeployOutcome = {
  ok: boolean;
  /** Staging URL on success. */
  url?: string | null;
  /** Why the deploy failed. */
  reason?: string | null;
};

export interface Deployer {
  /** Stable name for logs/audit, e.g. 'mock-deployer', 'staging-deployer'. */
  readonly name: string;
  /** Deploy the completed epic's integration branch to staging. */
  deployStaging(ctx: DeployContext): Promise<DeployOutcome>;
}
