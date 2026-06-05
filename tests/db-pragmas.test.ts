import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db/client.ts';

describe('openDb pragmas', () => {
  let tmpRoot: string;

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('sets a non-zero busy_timeout so concurrent writers retry instead of erroring', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-test-'));
    const { db } = openDb({ path: join(tmpRoot, 'test.db') });
    const row = db.pragma('busy_timeout', { simple: true });
    expect(Number(row)).toBeGreaterThanOrEqual(3000);
    db.close();
  });
});
