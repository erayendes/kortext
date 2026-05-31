import { describe, expect, it } from 'vitest';
import type { WorktreeHandle } from '../server/engine/worktree.ts';
import { ResolutionRegistry } from '../server/orchestrator/resolution-registry.ts';

const handleFor = (runId: number): WorktreeHandle => ({
  runId,
  path: `/wt/run-${runId}`,
  branch: `kortext/run-${runId}`,
  baseBranch: 'development',
});

describe('ResolutionRegistry — item → {handle, runId, worktree} ledger (capstone composition, §5.14)', () => {
  it('records an item run and resolves its handle, run id, and run-context', () => {
    const reg = new ResolutionRegistry();
    const handle = handleFor(7);
    reg.record('I1', { runId: 7, worktreePath: '/wt/run-7', handle });

    // The three views the real adapters resolve through:
    expect(reg.resolveRunId('I1')).toBe(7); // QueueReviewApprover (C3)
    expect(reg.resolveHandle('I1')).toEqual(handle); // GitMerger (C2)
    expect(reg.runContextFor('I1')).toEqual({ runId: 7, worktreePath: '/wt/run-7' }); // AgentGateExecutor (C5)
  });

  it('returns null for an item that was never recorded', () => {
    const reg = new ResolutionRegistry();
    expect(reg.resolveRunId('GHOST')).toBeNull();
    expect(reg.resolveHandle('GHOST')).toBeNull();
    expect(reg.runContextFor('GHOST')).toBeNull();
  });

  it('records a null handle (mock worktree with no real WorktreeManager handle)', () => {
    const reg = new ResolutionRegistry();
    reg.record('I2', { runId: 9, worktreePath: '/tmp/wt/I2', handle: null });
    expect(reg.resolveRunId('I2')).toBe(9);
    expect(reg.resolveHandle('I2')).toBeNull();
    expect(reg.runContextFor('I2')).toEqual({ runId: 9, worktreePath: '/tmp/wt/I2' });
  });

  it('forget() drops the item so a later resolve sees nothing (post-merge cleanup)', () => {
    const reg = new ResolutionRegistry();
    reg.record('I3', { runId: 3, worktreePath: '/wt/run-3', handle: handleFor(3) });
    expect(reg.forget('I3')).toBe(true);
    expect(reg.resolveRunId('I3')).toBeNull();
    expect(reg.resolveHandle('I3')).toBeNull();
    // forget on an unknown item is a harmless false.
    expect(reg.forget('I3')).toBe(false);
  });

  it('re-recording an item overwrites the previous entry (a fresh run replaces the old)', () => {
    const reg = new ResolutionRegistry();
    reg.record('I4', { runId: 1, worktreePath: '/wt/run-1', handle: handleFor(1) });
    reg.record('I4', { runId: 2, worktreePath: '/wt/run-2', handle: handleFor(2) });
    expect(reg.resolveRunId('I4')).toBe(2);
    expect(reg.resolveHandle('I4')?.runId).toBe(2);
  });
});
