import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * `.env`-style KEY=VALUE store for user-managed secrets — API tokens (the
 * Integrations pane) and environment variables (the Environment pane).
 *
 * Eray's choice (2026-06-04): a plain local file over an encrypted vault, for a
 * single-user local tool. The file lives at `<project>/.kortext/secrets.env`,
 * which is already git-ignored (the whole `.kortext/` tree is). Plaintext and
 * human-inspectable on purpose.
 *
 * Values are written raw when "simple"; anything containing whitespace, quotes
 * or `#` is JSON-quoted so it round-trips exactly.
 */

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidSecretKey(key: string): boolean {
  return KEY_RE.test(key);
}

function parseValue(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value;
    }
  }
  return value;
}

function serializeValue(value: string): string {
  return /[\s#"'\\]/.test(value) ? JSON.stringify(value) : value;
}

export function readSecrets(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!isValidSecretKey(key)) continue;
    out[key] = parseValue(line.slice(eq + 1));
  }
  return out;
}

function writeAll(filePath: string, data: Record<string, string>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const lines = Object.entries(data).map(
    ([k, v]) => `${k}=${serializeValue(v)}`,
  );
  writeFileSync(filePath, lines.length ? lines.join('\n') + '\n' : '', 'utf8');
}

export function setSecret(filePath: string, key: string, value: string): void {
  if (!isValidSecretKey(key)) {
    throw new Error(`invalid secret key: ${key}`);
  }
  const data = readSecrets(filePath);
  data[key] = value;
  writeAll(filePath, data);
}

export function deleteSecret(filePath: string, key: string): boolean {
  const data = readSecrets(filePath);
  if (!(key in data)) return false;
  delete data[key];
  writeAll(filePath, data);
  return true;
}

/** Show only the last 4 chars; never expose a full secret to the dashboard. */
export function maskSecret(value: string): string {
  if (value.length <= 4) return '••••';
  return '••••' + value.slice(-4);
}
