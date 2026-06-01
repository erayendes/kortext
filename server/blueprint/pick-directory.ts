import { spawn } from 'node:child_process';

/**
 * Parse the output of the macOS folder chooser (osascript). Returns the chosen
 * absolute POSIX path on success (trailing slash stripped), or null when the
 * user cancelled (non-zero exit) or the output was empty.
 */
export function parsePickedPath(stdout: string, exitCode: number): string | null {
  if (exitCode !== 0) return null;
  const p = stdout.trim();
  if (!p) return null;
  return p.replace(/\/+$/, '');
}

/**
 * Open a native folder picker and resolve to the chosen absolute path, or null
 * (cancelled / unsupported platform). macOS-only for now via `osascript`; other
 * platforms resolve to null so the UI falls back to a typed path. The spawn is
 * injectable so the parsing logic stays unit-testable.
 */
export function pickDirectoryNative(
  platform: NodeJS.Platform = process.platform,
  spawnFn: typeof spawn = spawn,
): Promise<string | null> {
  if (platform !== 'darwin') return Promise.resolve(null);
  return new Promise((resolveResult) => {
    const proc = spawnFn('osascript', [
      '-e',
      'POSIX path of (choose folder with prompt "Select your Kortext project folder")',
    ]);
    let out = '';
    proc.stdout?.on('data', (d) => {
      out += String(d);
    });
    proc.on('close', (code) => {
      resolveResult(parsePickedPath(out, code ?? 1));
    });
    proc.on('error', () => resolveResult(null));
  });
}
