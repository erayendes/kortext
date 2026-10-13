import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// The key every API caller shows: the panel as a cookie, the CLI and the menu
// bar app as a header. It lives beside the database, readable by this user
// only, so another account on the machine — or an app with network access but
// no access to this user's files — cannot drive the agents. It survives a
// restart, so a browser that has it once keeps it.

export const TOKEN_HEADER = 'x-kortext-token';
export const TOKEN_COOKIE = 'kortext_token';

export const tokenPath = (dbPath: string): string => `${dbPath}.token`;

/** The token for this database, created on first use. */
export function ensureToken(dbPath: string): string {
  const path = tokenPath(dbPath);
  if (existsSync(path)) {
    const token = readFileSync(path, 'utf8').trim();
    if (token) return token;
  }
  mkdirSync(dirname(path), { recursive: true });
  const token = randomBytes(32).toString('hex');
  writeFileSync(path, token + '\n', { mode: 0o600 });
  chmodSync(path, 0o600); // an existing empty file keeps its mode otherwise
  return token;
}

/** Null when the server has not written one yet. */
export function readToken(dbPath: string): string | null {
  try {
    return readFileSync(tokenPath(dbPath), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function sameToken(given: string | undefined, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The token from a Cookie header, if the panel sent one. */
export function cookieToken(header: string | undefined): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name === TOKEN_COOKIE) return value.join('=');
  }
  return undefined;
}
