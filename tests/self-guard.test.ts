import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isKortextPackageDir } from '../server/registry/self-guard.ts';

describe('isKortextPackageDir', () => {
  it('returns true for a directory whose package.json is named "kortext"', () => {
    expect(isKortextPackageDir('/anything', () => 'kortext')).toBe(true);
  });

  it('returns false for an ordinary project directory', () => {
    expect(isKortextPackageDir('/anything', () => 'my-app')).toBe(false);
  });

  it('returns false when there is no readable package.json', () => {
    expect(isKortextPackageDir('/anything', () => null)).toBe(false);
  });

  it('reads a real package.json from disk by default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kortext-self-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'kortext', version: '3.1.0' }));
      expect(isKortextPackageDir(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns false for a real directory with a non-kortext package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kortext-self-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme-crm' }));
      expect(isKortextPackageDir(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
