#!/usr/bin/env node
// Friendly post-install pointer. MUST NOT throw — a noisy postinstall breaks
// `npm i -g`. Skipped in CI to keep automated installs quiet.
try {
  if (process.env.CI || process.env.KORTEXT_NO_POSTINSTALL) process.exit(0);
  const msg = [
    '',
    '  Kortext installed.',
    '',
    '  Start a project:   cd <your-project> && kortext start',
    '  See your projects: kortext list',
    '  Help:              kortext help',
    '',
  ].join('\n');
  process.stdout.write(msg);
} catch {
  // never block the install
}
process.exit(0);
