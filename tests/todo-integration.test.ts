import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ingestBacklogFile, ensureBacklogStructure } from '../server/engine/backlog-ingest.ts';
import { writeTodoFromDb } from '../server/engine/todo-generator.ts';

/**
 * End-to-end of the v1.0 planning artifact: a realistic backlog.yaml goes
 * through the REAL ingester into the REAL DB, then writeTodoFromDb produces the
 * consolidated TODO.md the dashboard renders. Proves the wiring index.ts uses.
 */
let repos: Repositories;
let dir: string;
beforeEach(() => {
  repos = openDb({ path: ':memory:' }).repositories;
  dir = mkdtempSync(join(tmpdir(), 'kortext-todo-'));
});

const BACKLOG = `items:
  - id: NOT-E01
    type: epic
    title: Auth
    version: v0.1
    description: Login & session
  - id: NOT-001
    type: task
    title: OAuth setup
    parent_epic: NOT-E01
    version: v0.1
    description: Wire the OAuth provider
    blocks: [NOT-002]
  - id: NOT-002
    type: task
    title: Session refresh
    parent_epic: NOT-E01
    version: v0.1
    description: Refresh tokens
    blocked_by: [NOT-001]
  - id: NOT-E02
    type: epic
    title: Billing
    version: v1.0
    description: Payments
  - id: NOT-003
    type: task
    title: Stripe checkout
    parent_epic: NOT-E02
    version: v1.0
    description: Hosted checkout
`;

describe('backlog.yaml → ingest → TODO.md (v1.0 end-to-end)', () => {
  it('produces a nested, version-ordered, dependency-ordered checklist', () => {
    const backlogPath = join(dir, 'backlog.yaml');
    writeFileSync(backlogPath, BACKLOG, 'utf8');

    ingestBacklogFile(repos, backlogPath, { code: 'NOT', defaultEpicTitle: 'Backlog' });
    ensureBacklogStructure(repos, { code: 'NOT', defaultEpicTitle: 'Backlog' });

    const todoPath = join(dir, 'TODO.md');
    writeTodoFromDb(repos, todoPath);
    const md = readFileSync(todoPath, 'utf8');

    // Versions nested, ascending.
    expect(md.indexOf('- [ ] v0.1')).toBeGreaterThanOrEqual(0);
    expect(md.indexOf('- [ ] v0.1')).toBeLessThan(md.indexOf('- [ ] v1.0'));
    // Epic + task nesting with real ids.
    expect(md).toMatch(/ {4}- \[ \] NOT-E01 - Auth/);
    expect(md).toMatch(/ {8}- \[ \] NOT-001 - OAuth setup/);
    // Dependency order: NOT-001 (blocks NOT-002) appears before NOT-002.
    expect(md.indexOf('NOT-001')).toBeLessThan(md.indexOf('NOT-002'));
    // Second version's epic + task present.
    expect(md).toMatch(/ {4}- \[ \] NOT-E02 - Billing/);
    expect(md).toMatch(/ {8}- \[ \] NOT-003 - Stripe checkout/);

    rmSync(dir, { recursive: true, force: true });
  });

  it('reflects a done status as a ticked box', () => {
    const backlogPath = join(dir, 'backlog.yaml');
    writeFileSync(backlogPath, BACKLOG, 'utf8');
    ingestBacklogFile(repos, backlogPath, { code: 'NOT' });
    // Mark one task done (what the external LLM would do via status, mirrored here).
    repos.backlog.transitionStatus('NOT-003', 'done');

    const todoPath = join(dir, 'TODO.md');
    writeTodoFromDb(repos, todoPath);
    const md = readFileSync(todoPath, 'utf8');
    expect(md).toMatch(/- \[x\] NOT-003 - Stripe checkout/);
    rmSync(dir, { recursive: true, force: true });
  });
});
