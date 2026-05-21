import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlueprintWatcher } from '../server/orchestrator/blueprint-watcher.ts';

let tmpRoot: string;
let blueprintPath: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-watcher-'));
  mkdirSync(join(tmpRoot, 'workspace', 'references'), { recursive: true });
  blueprintPath = join(tmpRoot, 'workspace', 'references', 'blueprint.md');
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writeBlueprint(status: string | null, body = '# Blueprint\n\ncontent'): void {
  const frontmatter = status === null ? '' : `---\nstatus: ${status}\n---\n`;
  writeFileSync(blueprintPath, `${frontmatter}${body}`, 'utf8');
}

describe('BlueprintWatcher', () => {
  it('triggers onApproved when status transitions to approved', async () => {
    writeBlueprint('draft');
    const onApproved = vi.fn().mockResolvedValue(undefined);
    const watcher = new BlueprintWatcher({ filePath: blueprintPath, onApproved });

    await watcher.handleChange(); // initial draft — no trigger
    expect(onApproved).not.toHaveBeenCalled();

    writeBlueprint('approved');
    const result = await watcher.handleChange();
    expect(result.triggered).toBe(true);
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it('does not re-trigger when status stays approved across multiple writes', async () => {
    writeBlueprint('approved');
    const onApproved = vi.fn().mockResolvedValue(undefined);
    const watcher = new BlueprintWatcher({ filePath: blueprintPath, onApproved });

    await watcher.handleChange();
    await watcher.handleChange();
    await watcher.handleChange();
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it('re-triggers if status oscillates approved → draft → approved', async () => {
    writeBlueprint('approved');
    const onApproved = vi.fn().mockResolvedValue(undefined);
    const watcher = new BlueprintWatcher({ filePath: blueprintPath, onApproved });

    await watcher.handleChange();
    writeBlueprint('draft');
    await watcher.handleChange();
    writeBlueprint('approved');
    await watcher.handleChange();

    expect(onApproved).toHaveBeenCalledTimes(2);
  });

  it('ignores missing file silently', async () => {
    const onApproved = vi.fn();
    const watcher = new BlueprintWatcher({
      filePath: join(tmpRoot, 'does-not-exist.md'),
      onApproved,
    });
    const result = await watcher.handleChange();
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('file-missing');
    expect(onApproved).not.toHaveBeenCalled();
  });

  it('ignores files without a status frontmatter field', async () => {
    writeBlueprint(null, '# no frontmatter');
    const onApproved = vi.fn();
    const watcher = new BlueprintWatcher({ filePath: blueprintPath, onApproved });
    const result = await watcher.handleChange();
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('no-status');
  });

  it('debounces concurrent handleChange calls to a single trigger', async () => {
    writeBlueprint('draft');
    let resolveApproval: (() => void) | null = null;
    const onApproved = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveApproval = resolve;
        }),
    );
    const watcher = new BlueprintWatcher({ filePath: blueprintPath, onApproved });
    await watcher.handleChange();

    writeBlueprint('approved');
    const p1 = watcher.handleChange();
    const p2 = watcher.handleChange();
    const p3 = watcher.handleChange();

    // None resolve until we let onApproved finish.
    resolveApproval!();
    await Promise.all([p1, p2, p3]);
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it('start()/stop() are no-ops when called without a real fs.watch session', () => {
    const watcher = new BlueprintWatcher({
      filePath: blueprintPath,
      onApproved: vi.fn(),
    });
    expect(() => watcher.stop()).not.toThrow();
  });
});
