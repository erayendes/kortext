import { describe, expect, it } from 'vitest';
import { HarmfulOutputFilter } from '../server/safety/harmful-output-filter.ts';

describe('HarmfulOutputFilter (placeholder, v3.0)', () => {
  it('is a no-op when no banned phrases configured', () => {
    const filter = new HarmfulOutputFilter();
    const report = filter.scanText('anything goes here, even rude words');
    expect(report.findings).toHaveLength(0);
    expect(report.shouldFailRun).toBe(false);
  });

  it('flags configured banned phrases (case-insensitive)', () => {
    const filter = new HarmfulOutputFilter({ bannedPhrases: ['Drop Table'] });
    const report = filter.scanText('SELECT * FROM x; drop table users;');
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.shouldFailRun).toBe(true);
    expect(report.findings[0]?.line_number).toBe(1);
  });

  it('reports line numbers correctly', () => {
    const filter = new HarmfulOutputFilter({ bannedPhrases: ['naughty'] });
    const body = 'line one\nline two\nthis is naughty\n';
    const report = filter.scanText(body);
    expect(report.findings[0]?.line_number).toBe(3);
  });
});
