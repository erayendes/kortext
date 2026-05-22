import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';

const startedAt = Date.now();

/**
 * Read the package version off the nearest package.json. Mirrors the
 * walk-up pattern bin/kortext.ts and mcp/server.ts use, so a single
 * package.json bump propagates everywhere instead of having hard-coded
 * literals drift across files.
 */
function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let cursor = here;
  for (let i = 0; i < 6; i++) {
    const pkgPath = join(cursor, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch {
        /* fall through */
      }
    }
    const parent = resolve(cursor, '..');
    if (parent === cursor) break;
    cursor = parent;
  }
  return 'unknown';
}

const VERSION = readPackageVersion();

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: VERSION,
    uptimeMs: Date.now() - startedAt,
  });
});
