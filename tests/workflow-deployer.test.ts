import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { WorkflowDeployer } from '../server/engine/executors/workflow-deployer.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

const deploymentWf = parseWorkflowMarkdown(
  `# Deployment Cycle
## Deploy
1. **+devops-engineer:** deploy development to staging
   - Outputs: deploy.md
`,
  'deployment-cycle',
);

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-wd-'));
  const bundle = openDb({ path: join(tmpRoot, 'wd.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('WorkflowDeployer — staging deploy via the deployment-cycle run (capstone C4, §5.9 #8/§5.11)', () => {
  it('a clean deployment-cycle run → ok, recording the epic on the run', async () => {
    const deployer = new WorkflowDeployer({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadDeploymentWorkflow: () => deploymentWf,
    });
    const out = await deployer.deployStaging({ epicId: 'EPIC-1' });
    expect(out.ok).toBe(true);
    // A real deployment run was driven through the engine for this epic.
    const runs = repos.runs.listRuns({ workflow_id: 'deployment-cycle', limit: 10 });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('succeeded');
    expect(runs[0]?.triggered_by).toContain('EPIC-1');
  });

  it('a failed deployment-cycle run → ok:false with the failure reason', async () => {
    const deployer = new WorkflowDeployer({
      repos,
      executor: new MockExecutor(() => ({ fail: true, summary: 'staging host unreachable' })),
      loadDeploymentWorkflow: () => deploymentWf,
    });
    const out = await deployer.deployStaging({ epicId: 'EPIC-2' });
    expect(out.ok).toBe(false);
    expect(out.reason).toBeTruthy();
  });

  it('no deployment-cycle workflow available → ok:false, no run driven', async () => {
    const deployer = new WorkflowDeployer({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadDeploymentWorkflow: () => null,
    });
    const out = await deployer.deployStaging({ epicId: 'EPIC-3' });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/workflow/i);
    expect(repos.runs.listRuns({ limit: 10 })).toHaveLength(0);
  });
});
