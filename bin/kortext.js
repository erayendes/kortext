#!/usr/bin/env node
// Dev-mode shim: delegates to the .ts entry via tsx until Faz 7 wires a real
// build step. In production, this file will be replaced by the compiled JS.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tsEntry = resolve(here, 'kortext.ts');

const result = spawnSync('npx', ['tsx', tsEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
