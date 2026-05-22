import { describe, expect, it } from 'vitest';
import { runPreflight, formatPreflightForCli } from '../server/cli/preflight.ts';

describe('runPreflight', () => {
  it('flags missing required tools', () => {
    const report = runPreflight({
      probe: () => ({ ok: false }),
    });
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain('node not found');
    expect(report.blockers).toContain('git not found');
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('flags an out-of-date node', () => {
    const report = runPreflight({
      probe: (cmd) => {
        if (cmd === 'node') return { ok: true, raw: 'v18.0.0' };
        if (cmd === 'git') return { ok: true, raw: 'git version 2.40.0' };
        return { ok: false };
      },
    });
    expect(report.ready).toBe(false);
    expect(report.blockers.some((b) => b.startsWith('node 18.0.0'))).toBe(true);
  });

  it('is ready when node and git are present with one CLI', () => {
    const report = runPreflight({
      probe: (cmd) => {
        if (cmd === 'node') return { ok: true, raw: 'v22.5.0' };
        if (cmd === 'git') return { ok: true, raw: 'git version 2.43.0' };
        if (cmd === 'claude') return { ok: true, raw: 'claude 1.2.3' };
        return { ok: false };
      },
    });
    expect(report.ready).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('formats the report into a readable block', () => {
    const report = runPreflight({
      probe: (cmd) => {
        if (cmd === 'node') return { ok: true, raw: 'v22.5.0' };
        return { ok: false };
      },
    });
    const text = formatPreflightForCli(report);
    expect(text).toContain('node');
    expect(text).toContain('git not found');
    expect(text).toContain('claude not found');
  });
});
