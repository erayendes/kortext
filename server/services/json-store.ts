import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Tiny JSON file store for non-secret, structured per-project config — the
 * Hooks pane toggles, the Integrations connected-state, etc. Each feature owns
 * its own file under `<project>/.kortext/settings/` so callers never share a
 * schema (and parallel work never collides).
 *
 * Reads are defensive: a missing OR corrupt file yields the caller's fallback
 * rather than throwing, so a hand-edited file can never crash a route.
 */

export function readJsonStore<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonStore<T>(filePath: string, data: T): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
