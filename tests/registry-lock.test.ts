import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withRegistryLock } from '../server/registry/lock.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kortext-lock-')); });
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* dir may already be gone */ } });

describe('withRegistryLock', () => {
  it('runs fn and returns its value', () => {
    const result = withRegistryLock(dir, () => 42);
    expect(result).toBe(42);
  });

  it('removes the lock file after fn returns normally', () => {
    const lockPath = join(dir, 'projects.json.lock');
    withRegistryLock(dir, () => {
      expect(existsSync(lockPath)).toBe(true);
    });
    expect(existsSync(lockPath)).toBe(false);
  });

  it('removes the lock file even when fn throws', () => {
    const lockPath = join(dir, 'projects.json.lock');
    expect(() =>
      withRegistryLock(dir, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('reclaims a stale lock file (mtime older than deadline) and completes', () => {
    const lockPath = join(dir, 'projects.json.lock');
    // Create a lock file that is 10 seconds old — well past the 2 s deadline.
    writeFileSync(lockPath, '');
    const tenSecondsAgo = (Date.now() - 10_000) / 1000;
    utimesSync(lockPath, tenSecondsAgo, tenSecondsAgo);

    // Should reclaim the stale lock and run fn successfully.
    const result = withRegistryLock(dir, () => 'reclaimed');
    expect(result).toBe('reclaimed');
    // Lock cleaned up after fn.
    expect(existsSync(lockPath)).toBe(false);
  });
});
