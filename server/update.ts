import { spawn } from 'node:child_process';

// Cache registry version checks for an hour; failures hide the update notice.
const TAGS_URL = 'https://registry.npmjs.org/-/package/kortext/dist-tags';
const CACHE_MS = 60 * 60 * 1000;

export type Tags = { latest?: string; beta?: string };
export type Channel = 'latest' | 'beta';
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
 * What a channel would install over `current`, or null when it has nothing newer. Stable offers
 * the release. Beta offers the beta while it is ahead of the release, else the release — so a
 * beta user takes each release too, and stays on beta for the next one.
 */
export function offer(channel: Channel, tags: Tags, current: string): string | null {
  const { latest, beta } = tags;
  const want = channel === 'beta' && beta && (!latest || isNewer(beta, latest)) ? beta : latest;
  return want && isNewer(want, current) ? want : null;
}

// What npm hands back as a version; anything else never reaches the command line.
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

/**
 * Update the global package and allow the SQLite binding install script.
 * Windows requires a shell for the npm .cmd shim; the version is checked above, the rest is fixed.
 */
export function selfUpdate(version: string): Promise<{ ok: boolean; output: string }> {
  if (!VERSION.test(version)) return Promise.resolve({ ok: false, output: `not a version: ${version}` });
  return new Promise((resolve) => {
    const proc = spawn(
      'npm',
      // --prefer-online: the panel saw the new tag on a fresh fetch; npm's cached
      // packument may still say the old one and reinstall what is already there.
      ['install', '-g', '--prefer-online', '--allow-scripts=better-sqlite3', `kortext@${version}`],
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
