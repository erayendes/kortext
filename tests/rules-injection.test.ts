import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRulesBlock } from '../server/engine/rules-injection.ts';

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
