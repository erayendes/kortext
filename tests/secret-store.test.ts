import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readSecrets,
  setSecret,
  deleteSecret,
  maskSecret,
  isValidSecretKey,
} from '../server/services/secret-store.ts';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kortext-secrets-'));
  file = join(dir, 'nested', 'secrets.env');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('secret-store', () => {
  it('returns {} when the file is missing', () => {
    expect(readSecrets(file)).toEqual({});
  });

  it('round-trips a simple key/value (creating parent dirs)', () => {
    setSecret(file, 'GITHUB_TOKEN', 'ghp_abc123');
    expect(existsSync(file)).toBe(true);
    expect(readSecrets(file)).toEqual({ GITHUB_TOKEN: 'ghp_abc123' });
  });

  it('overwrites an existing key, preserving others', () => {
    setSecret(file, 'A', '1');
    setSecret(file, 'B', '2');
    setSecret(file, 'A', '99');
    expect(readSecrets(file)).toEqual({ A: '99', B: '2' });
  });

  it('round-trips values containing spaces and special chars', () => {
    setSecret(file, 'NOTE', 'hello world # not-a-comment');
    expect(readSecrets(file).NOTE).toBe('hello world # not-a-comment');
  });

  it('ignores blank lines and # comments on read', () => {
    setSecret(file, 'X', 'y');
    const raw = readFileSync(file, 'utf8');
    const withNoise = `# a comment\n\n${raw}\n   \n`;
    writeFileSync(file, withNoise);
    expect(readSecrets(file)).toEqual({ X: 'y' });
  });

  it('deletes a key and reports whether it existed', () => {
    setSecret(file, 'A', '1');
    expect(deleteSecret(file, 'A')).toBe(true);
    expect(deleteSecret(file, 'A')).toBe(false);
    expect(readSecrets(file)).toEqual({});
  });

  it('rejects invalid keys', () => {
    expect(isValidSecretKey('GOOD_KEY1')).toBe(true);
    expect(isValidSecretKey('1BAD')).toBe(false);
    expect(isValidSecretKey('has space')).toBe(false);
    expect(() => setSecret(file, 'bad key', 'v')).toThrow();
  });

  it('masks values, showing only the last 4 chars', () => {
    expect(maskSecret('ghp_supersecret1234')).toBe('••••1234');
    expect(maskSecret('ab')).toBe('••••');
  });
});
