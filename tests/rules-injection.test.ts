import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRulesBlock, filterInjectedRuleInputs } from '../server/engine/rules-injection.ts';

// UAT #7: rules/*.md (behavior.md, models.md) were NEVER injected into any
// agent prompt — they existed only for the dashboard. The agent therefore
// could not see the behavior contract or the model mapping it was told to use.
// behavior.md must reach EVERY step; a rule a step declares in its `inputs`
// (e.g. rules/models.md on the model-assignment step) must reach THAT step.
let rulesDir: string;
beforeEach(() => {
  rulesDir = mkdtempSync(join(tmpdir(), 'kx-rules-'));
  writeFileSync(join(rulesDir, 'behavior.md'), '# Behavior\n\nAlways write files, never chat.');
  writeFileSync(join(rulesDir, 'models.md'), '# Models\n\nroutine → fast-reasoning.');
  writeFileSync(join(rulesDir, 'branching.md'), '# Branching\n\nFeature branches off development.');
});
afterEach(() => rmSync(rulesDir, { recursive: true, force: true }));

// UAT #10 — gereksiz input kırp: a rules/*.md the step declares is ALREADY
// injected into the prompt by buildRulesBlock; listing it again under "Inputs"
// makes the agent Read the same content a second time (the headless contract
// tells it to read inputs) = double-spent tokens. filterInjectedRuleInputs
// removes from the Inputs list exactly what buildRulesBlock injected — and
// ONLY that (no rulesDir / missing file → the entry stays, the agent must
// still read it itself).
describe('filterInjectedRuleInputs', () => {
  it('drops a rules input that buildRulesBlock injects', () => {
    expect(
      filterInjectedRuleInputs(['backlog-assignees-set', 'rules/models.md'], rulesDir),
    ).toEqual(['backlog-assignees-set']);
  });

  it('keeps non-rule inputs untouched', () => {
    expect(filterInjectedRuleInputs(['docs/api.md', '.kortext/foundation/PRD.md'], rulesDir)).toEqual([
      'docs/api.md',
      '.kortext/foundation/PRD.md',
    ]);
  });

  it('keeps a rules input when rulesDir is undefined (nothing was injected)', () => {
    expect(filterInjectedRuleInputs(['rules/models.md'], undefined)).toEqual(['rules/models.md']);
  });

  it('keeps a rules input whose file does not exist (it was not injected)', () => {
    expect(filterInjectedRuleInputs(['rules/nonexistent.md'], rulesDir)).toEqual([
      'rules/nonexistent.md',
    ]);
  });

  it('keeps a rules input whose file is empty (buildRulesBlock skips empty files)', () => {
    writeFileSync(join(rulesDir, 'empty.md'), '   \n');
    expect(buildRulesBlock(['rules/empty.md'], rulesDir)).not.toContain('empty.md');
    expect(filterInjectedRuleInputs(['rules/empty.md'], rulesDir)).toEqual(['rules/empty.md']);
  });
});

describe('buildRulesBlock', () => {
  it('always injects behavior.md (universal), regardless of step inputs', () => {
    const block = buildRulesBlock([], rulesDir);
    expect(block).toContain('Always write files, never chat.');
  });

  it('injects a rule the step declares in its inputs (rules/models.md)', () => {
    const block = buildRulesBlock(['backlog-assignees-set', 'rules/models.md'], rulesDir);
    expect(block).toContain('Always write files, never chat.'); // behavior still universal
    expect(block).toContain('routine → fast-reasoning.'); // models because declared
  });

  it('does NOT inject a rule that is not declared and not universal', () => {
    const block = buildRulesBlock(['rules/models.md'], rulesDir);
    expect(block).not.toContain('Feature branches off development.'); // branching not declared
  });

  it('tolerates a `.kortext/...`-style path input without matching it as a rule', () => {
    const block = buildRulesBlock(['.kortext/foundation/PRD.md'], rulesDir);
    expect(block).toContain('Always write files, never chat.');
    expect(block).not.toContain('routine → fast-reasoning.');
  });

  it('returns empty string when rulesDir is undefined (no crash)', () => {
    expect(buildRulesBlock(['rules/models.md'], undefined)).toBe('');
  });

  it('skips a declared rule file that does not exist on disk', () => {
    const block = buildRulesBlock(['rules/nonexistent.md'], rulesDir);
    expect(block).toContain('Always write files, never chat.'); // behavior still there
    expect(block).not.toContain('nonexistent');
  });
});
