import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import {
  makeServerDrive,
  type ServerDriveDeps,
} from '../server/orchestrator/server-drive.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

const devWf = parseWorkflowMarkdown(
  `# Development Cycle
## Build
1. **+backend-developer:** implement the item
   - Outputs: impl.md
`,
  'development-cycle',
);

function baseDeps(overrides: Partial<ServerDriveDeps> = {}): ServerDriveDeps {
  return {
    repos,
    personas: loadPersonasFromDir(join(tmpRoot, 'agents')),
    workflows: { get: (id) => (id === 'development-cycle' ? devWf : null) },
    queue: new ApprovalQueue({ repos }),
    repoRoot: tmpRoot,
    agentsDir: join(tmpRoot, 'agents'),
    enabled: () => true,
    resolveExecutor: () => ({ chain: ['mock'] }),
    ...overrides,
  };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-srvdrv-'));
  mkdirSync(join(tmpRoot, 'agents'), { recursive: true });
  const bundle = openDb({ path: join(tmpRoot, 'srvdrv.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('makeServerDrive — assembles the driver runtime from server-loaded pieces (§5.16)', () => {
  it("drive() fails with a clear error when the 'development-cycle' workflow is not loaded", async () => {
    const sd = makeServerDrive(baseDeps({ workflows: { get: () => null } }));
    await expect(sd.drive()).rejects.toThrow(/development-cycle/);
  });

  it('builds the runtime once across repeated drives (the resolution ledger must persist)', async () => {
    let execResolves = 0;
    const sd = makeServerDrive(
      baseDeps({
        resolveExecutor: () => {
          execResolves++;
          return { chain: ['mock'] };
        },
      }),
    );
    // Empty backlog → each pass is a no-op (no git), but the runtime — and its
    // ResolutionRegistry — must be built lazily exactly once and reused.
    await sd.drive();
    await sd.drive();
    expect(execResolves).toBe(1);
  });

  it('passes enabled() straight through (the switch the route reads)', () => {
    const sd = makeServerDrive(baseDeps({ enabled: () => false }));
    expect(sd.enabled()).toBe(false);
  });
});
