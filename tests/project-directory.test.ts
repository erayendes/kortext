import { describe, it, expect } from 'vitest';
import { resolveBlueprintTarget } from '../server/blueprint/io.ts';
import { parsePickedPath } from '../server/blueprint/pick-directory.ts';

describe('resolveBlueprintTarget', () => {
  const daemonRoot = '/Users/eray/acme';

  it('uses the daemon workspace when no projectDir is given', () => {
    const t = resolveBlueprintTarget(undefined, daemonRoot);
    expect(t.root).toBe(daemonRoot);
    expect(t.isElsewhere).toBe(false);
    expect(t.paths.blueprintPath).toBe('/Users/eray/acme/.kortext/foundation/BRD.md');
  });

  it('treats a projectDir equal to the workspace as not-elsewhere', () => {
    const t = resolveBlueprintTarget('/Users/eray/acme', daemonRoot);
    expect(t.isElsewhere).toBe(false);
  });

  it('roots elsewhere when projectDir differs from the workspace', () => {
    const t = resolveBlueprintTarget('/Users/eray/other', daemonRoot);
    expect(t.root).toBe('/Users/eray/other');
    expect(t.isElsewhere).toBe(true);
    expect(t.paths.projectJsonPath).toBe('/Users/eray/other/.kortext/project.json');
  });

  it('ignores empty / whitespace projectDir', () => {
    expect(resolveBlueprintTarget('   ', daemonRoot).isElsewhere).toBe(false);
    expect(resolveBlueprintTarget('', daemonRoot).isElsewhere).toBe(false);
  });
});

describe('parsePickedPath', () => {
  it('returns the trimmed path on success, stripping a trailing slash', () => {
    expect(parsePickedPath('/Users/eray/acme/\n', 0)).toBe('/Users/eray/acme');
    expect(parsePickedPath('/Users/eray/acme', 0)).toBe('/Users/eray/acme');
  });

  it('returns null when the dialog is cancelled (non-zero exit)', () => {
    expect(parsePickedPath('', 1)).toBeNull();
    expect(parsePickedPath('User canceled.', 1)).toBeNull();
  });

  it('returns null on empty output', () => {
    expect(parsePickedPath('   ', 0)).toBeNull();
  });
});
