import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Read a directory's package.json `name`, or null if missing/unreadable. */
function readPackageName(dir: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown };
    return typeof pkg.name === 'string' ? pkg.name : null;
  } catch {
    return null;
  }
}

/**
 * True when `dir` is Kortext's own package directory (the dev source checkout or
 * the global install). A project must NEVER be created or started there: the dir
 * already carries a `.kortext/` for dev/demo purposes, which would otherwise make
 * `kortext start` mistake the tool's own home for a user project.
 *
 * `readName` is injectable for tests; the default reads package.json from disk.
 */
export function isKortextPackageDir(dir: string, readName = readPackageName): boolean {
  return readName(dir) === 'kortext';
}
