import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonStore, writeJsonStore } from '../server/services/json-store.ts';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kortext-jsonstore-'));
  file = join(dir, 'nested', 'settings.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('json-store', () => {
  it('returns the fallback when the file is missing', () => {
    expect(readJsonStore(file, { a: 1 })).toEqual({ a: 1 });
  });

  it('round-trips an object (creating parent dirs)', () => {
    writeJsonStore(file, { hooks: { onPush: true }, count: 3 });
    expect(existsSync(file)).toBe(true);
    expect(readJsonStore(file, {})).toEqual({ hooks: { onPush: true }, count: 3 });
  });

  it('returns the fallback when the file is corrupt', () => {
    writeFileSync(file.replace('/nested/', '/'), 'not json {{{');
    expect(readJsonStore(file.replace('/nested/', '/'), { safe: true })).toEqual({
      safe: true,
    });
  });
});
