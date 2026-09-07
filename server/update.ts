import { spawn } from 'node:child_process';

// Cache registry version checks for six hours; failures hide the update notice.
const LATEST_URL = 'https://registry.npmjs.org/kortext/latest';
const CACHE_MS = 6 * 60 * 60 * 1000;

let cached: { at: number; version: string } | null = null;

export async function latestVersion(): Promise<string | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.version;
  try {
    const res = await fetch(LATEST_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const { version } = (await res.json()) as { version?: string };
    if (!version) return null;
    cached = { at: Date.now(), version };
    return version;
  } catch {
    return null;
  }
}

/* Compare the first three numeric version components, ignoring prerelease suffixes. */
export function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) =>
    v
      .split('-')[0]
      .split('.')
      .map((n) => Number(n) || 0);
  const [a, b] = [parts(latest), parts(current)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/**
 * Update the global package and allow the SQLite binding install script.
 * Windows requires a shell for the npm .cmd shim; command arguments are fixed.
 */
export function selfUpdate(): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(
      'npm',
      ['install', '-g', '--allow-scripts=better-sqlite3', 'kortext@latest'],
      { shell: process.platform === 'win32' },
    );
    let output = '';
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000);
    };
    proc.stdout.on('data', collect);
    proc.stderr.on('data', collect);
    proc.on('error', (err) => resolve({ ok: false, output: err.message }));
    proc.on('close', (code) => {
      if (code === 0) cached = null; // the next check compares against what is now installed
      resolve({ ok: code === 0, output: output.trim() });
    });
  });
}
