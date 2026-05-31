import type { DeployContext, DeployOutcome, Deployer } from '../deployer.ts';

export type MockDeployBehavior = {
  /** Force a failed deploy. */
  fail?: boolean;
  /** Staging URL returned on success. Default a fake staging URL. */
  url?: string | null;
  /** Reason surfaced on failure. */
  reason?: string | null;
  /** Delay before resolving, ms. Default 0. */
  durationMs?: number;
  /** Throw instead of returning — exercises the crash path. */
  throws?: boolean;
};

/**
 * Deterministic Deployer for tests — the staging counterpart of MockMerger.
 * Tracks which epics it deployed so tests can assert the trigger fired only
 * when the epic was actually complete.
 */
export class MockDeployer implements Deployer {
  readonly name = 'mock-deployer';
  /** Epics deployStaging() was called for, in order. */
  readonly deployedFor: string[] = [];

  constructor(private readonly behavior: (ctx: DeployContext) => MockDeployBehavior = () => ({})) {}

  async deployStaging(ctx: DeployContext): Promise<DeployOutcome> {
    this.deployedFor.push(ctx.epicId);
    const cfg = this.behavior(ctx);
    if (cfg.durationMs && cfg.durationMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, cfg.durationMs));
    }
    if (cfg.throws) {
      throw new Error(cfg.reason ?? 'mock deployer crash');
    }
    if (cfg.fail) {
      return { ok: false, reason: cfg.reason ?? 'staging deploy failed' };
    }
    return { ok: true, url: cfg.url ?? `https://staging.example/${ctx.epicId}` };
  }
}
