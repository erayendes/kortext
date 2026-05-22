#!/usr/bin/env node
// Post-build step: tsc doesn't copy non-TS assets. The migration runner
// expects `server/db/migrations/*.sql` next to the compiled `migrate.js`,
// so we mirror them into `dist/server/db/migrations/` after tsc emits.

import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = join(root, 'server', 'db', 'migrations');
const dst = join(root, 'dist', 'server', 'db', 'migrations');

if (!existsSync(src)) {
  console.error(`[copy-migrations] source missing: ${src}`);
  process.exit(1);
}
if (!existsSync(join(root, 'dist'))) {
  console.error('[copy-migrations] dist/ not found — did `tsc` run?');
  process.exit(1);
}

mkdirSync(dst, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.sql'));
for (const f of files) {
  cpSync(join(src, f), join(dst, f));
}
console.error(`[copy-migrations] copied ${files.length} migration file(s) → ${dst}`);
