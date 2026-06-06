import { describe, it, expect } from 'vitest';
import { updateCommandPlan } from '../server/cli/cmd-update.ts';

describe('updateCommandPlan', () => {
  it('runs npm update -g for the kortext package', () => {
    expect(updateCommandPlan()).toEqual({ command: 'npm', args: ['update', '-g', 'kortext'] });
  });
});
