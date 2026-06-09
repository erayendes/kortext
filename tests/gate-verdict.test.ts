import { describe, expect, it } from 'vitest';
import { parseGateVerdict } from '../server/engine/gate-verdict.ts';

describe('parseGateVerdict — strict machine-readable gate verdict (#4)', () => {
  it('verdict: pass → pass true, ac_results parsed', () => {
    const report = [
      '---',
      'verdict: pass',
      'ac_results:',
      '  - text: "User can log in"',
      '    status: met',
      '  - text: "Errors are shown"',
      '    status: met',
      '---',
      'Everything looks good.',
    ].join('\n');

    const out = parseGateVerdict(report);
    expect(out.pass).toBe(true);
    expect(out.acResults).toEqual([
      { text: 'User can log in', status: 'met' },
      { text: 'Errors are shown', status: 'met' },
    ]);
    expect(out.findings).toContain('Everything looks good.');
  });

  it('verdict: fail → pass false, unmet ac surfaced', () => {
    const report = [
      '---',
      'verdict: fail',
      'ac_results:',
      '  - text: "User can log in"',
      '    status: unmet',
      '---',
      'Login button does nothing on click.',
    ].join('\n');

    const out = parseGateVerdict(report);
    expect(out.pass).toBe(false);
    expect(out.acResults).toEqual([{ text: 'User can log in', status: 'unmet' }]);
    expect(out.findings).toContain('Login button does nothing');
  });

  it('missing verdict → strict fail with a clear finding', () => {
    const report = ['---', 'ac_results: []', '---', 'No verdict here.'].join('\n');
    const out = parseGateVerdict(report);
    expect(out.pass).toBe(false);
    expect(out.findings).toBe('gate report missing a verdict');
    expect(out.acResults).toEqual([]);
  });

  it('invalid verdict value → strict fail', () => {
    const report = ['---', 'verdict: maybe', '---', 'body'].join('\n');
    const out = parseGateVerdict(report);
    expect(out.pass).toBe(false);
    expect(out.findings).toBe('gate report missing a verdict');
  });

  it('no frontmatter at all → strict fail', () => {
    const out = parseGateVerdict('just some prose, no frontmatter');
    expect(out.pass).toBe(false);
    expect(out.findings).toBe('gate report missing a verdict');
    expect(out.acResults).toEqual([]);
  });

  it('prefers a findings: frontmatter field over the body', () => {
    const report = [
      '---',
      'verdict: fail',
      'findings: "Contrast ratio below WCAG AA on the primary button."',
      '---',
      'body text that should be ignored',
    ].join('\n');
    const out = parseGateVerdict(report);
    expect(out.findings).toBe('Contrast ratio below WCAG AA on the primary button.');
  });

  it('ac_results defaults to [] when absent', () => {
    const report = ['---', 'verdict: pass', '---', 'ok'].join('\n');
    const out = parseGateVerdict(report);
    expect(out.acResults).toEqual([]);
  });
});
