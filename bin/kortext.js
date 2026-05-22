#!/usr/bin/env node
// Dual-mode entry: prefer the compiled JS when `dist/bin/kortext.js` is
// present (production install via `npm run build`), fall back to tsx in
// development so contributors can `npx kortext …` against source.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, '..', 'dist', 'bin', 'kortext.js');

if (existsSync(compiled)) {
  // Run in-process — no tsx hop, no extra startup cost.
  await import(pathToFileURL(compiled).href);
} else {
  const tsEntry = resolve(here, 'kortext.ts');
  const result = spawnSync('npx', ['tsx', tsEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: false,
  });
  process.exit(result.status ?? 1);
}
