import { spawn } from 'node:child_process';

// Cache registry version checks for an hour; failures hide the update notice.
const TAGS_URL = 'https://registry.npmjs.org/-/package/kortext/dist-tags';
const CACHE_MS = 60 * 60 * 1000;

export type Tags = { latest?: string; beta?: string };
let cached: { at: number; tags: Tags } | null = null;

/** npm's dist-tags — `latest` and, while one is out, `beta` — cached for an hour. */
export async function distTags(fresh = false): Promise<Tags> {
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.tags;
  try {
    const res = await fetch(TAGS_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return {};
    const tags = (await res.json()) as Tags;
    cached = { at: Date.now(), tags };
    return tags;
  } catch {
    return {};
  }
}

/** A pre-release runs on the beta channel; anything else on latest. */
export const channelOf = (version: string): 'latest' | 'beta' =>
  version.includes('-') ? 'beta' : 'latest';

/** Compare the three numeric components, then the pre-release number; a release beats its own betas. */
export function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) => {
    const [core, pre] = v.split('-');
    const n = core.split('.').map((x) => Number(x) || 0);
    // ponytail: only `beta.N` is ever published; no full semver precedence
    n[3] = pre ? Number(pre.replace(/\D/g, '')) || 0 : Infinity;
    return n;
  };
  const [a, b] = [parts(latest), parts(current)];
  for (let i = 0; i < 4; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/**
 * Update the global package and allow the SQLite binding install script.
 * Windows requires a shell for the npm .cmd shim; command arguments are fixed.
 */
export function selfUpdate(
  tag: 'latest' | 'beta' = 'latest',
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(
      'npm',
      ['install', '-g', '--allow-scripts=better-sqlite3', `kortext@${tag}`],
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
