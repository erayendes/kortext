import { describe, it, expect, vi } from 'vitest';
import { autoStartPendingAnalysis } from '../server/orchestrator/auto-start-analysis.ts';
import type { ProjectMeta } from '../server/blueprint/io.ts';

const META: ProjectMeta = {
  name: 'Acme', code: 'ACME', type: 'new', platforms: ['web'],
  githubRepo: null, executor: 'claude', executorBinary: null, createdAt: 1,
};
function repos(runs: Array<{ workflow_id: string }>) {
  return { runs: { listRuns: vi.fn(() => runs) } } as any;
}

describe('autoStartPendingAnalysis', () => {
  it('triggers analysis when approved and no prior run exists', () => {
    const trigger = vi.fn();
    const res = autoStartPendingAnalysis({
      repos: repos([]), blueprintPath: '/bp', projectJsonPath: '/pj', trigger,
      readStatus: () => 'approved', readMeta: () => META,
    });
    expect(res.started).toBe(true);
    expect(res.workflowId).toBe('new-project-analysis');
    expect(trigger).toHaveBeenCalledWith('new-project-analysis');
  });

  it('does NOT trigger when blueprint not approved', () => {
    const trigger = vi.fn();
    const res = autoStartPendingAnalysis({
      repos: repos([]), blueprintPath: '/bp', projectJsonPath: '/pj', trigger,
      readStatus: () => 'draft', readMeta: () => META,
    });
    expect(res.started).toBe(false);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('does NOT trigger when an analysis run already exists (idempotent)', () => {
    const trigger = vi.fn();
    const res = autoStartPendingAnalysis({
      repos: repos([{ workflow_id: 'new-project-analysis' }]),
      blueprintPath: '/bp', projectJsonPath: '/pj', trigger,
      readStatus: () => 'approved', readMeta: () => META,
    });
    expect(res.started).toBe(false);
    expect(res.reason).toMatch(/already/i);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('does NOT trigger when meta is missing', () => {
    const trigger = vi.fn();
    const res = autoStartPendingAnalysis({
      repos: repos([]), blueprintPath: '/bp', projectJsonPath: '/pj', trigger,
      readStatus: () => 'approved', readMeta: () => null,
    });
    expect(res.started).toBe(false);
    expect(trigger).not.toHaveBeenCalled();
  });
});
