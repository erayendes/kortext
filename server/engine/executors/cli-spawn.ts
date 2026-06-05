import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Low-level helper used by every CLI executor.
 *
 * Why a helper and not a base class:
 *   - The three executors (claude, codex, gemini) each own their prompt-assembly,
 *     output validation, and summary extraction — those stay in the executor file.
 *   - The boring-but-critical bits (shell-free spawn, SIGTERM→SIGKILL on abort,
 *     stdout/stderr captured to a log file) live here once so we don't drift.
 *
 * IMPORTANT: never pass a single command string. Always pass `binary + args`,
 * because `spawn(cmd, args)` does NOT invoke a shell, so step descriptions and
 * persona handles can never be interpreted as shell metacharacters.
 */

export type SpawnCliOptions = {
  binary: string;
  args: string[];
  cwd: string;
  stdin?: string;
  logPath: string;
  signal: AbortSignal;
  /** Delay between SIGTERM and SIGKILL when aborted. Default 5000ms. */
  sigkillDelayMs?: number;
  /** Soft timeout — kill after N ms regardless of signal. Default unset. */
  timeoutMs?: number;
  /** Capped buffer of last K stdout chars used to build a summary. Default 64 KiB. */
  summaryBufferBytes?: number;
};

export type SpawnCliResult = {
  /** Process exit code. null when killed by a signal. */
  exitCode: number | null;
  /** Signal that terminated the process, if any. */
  signal: NodeJS.Signals | null;
  /** Tail of stdout (up to summaryBufferBytes). */
  stdoutTail: string;
  /** Tail of stderr (up to summaryBufferBytes). */
  stderrTail: string;
  /** True if AbortSignal triggered the kill. */
  aborted: boolean;
};

export async function spawnCli(opts: SpawnCliOptions): Promise<SpawnCliResult> {
  const sigkillDelayMs = opts.sigkillDelayMs ?? 5000;
  const summaryCap = opts.summaryBufferBytes ?? 64 * 1024;

  if (opts.signal.aborted) {
    return {
      exitCode: null,
      signal: null,
      stdoutTail: '',
      stderrTail: '',
      aborted: true,
    };
  }

  const proc = spawn(opts.binary, opts.args, {
    cwd: opts.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    // shell: false is the default for spawn() — being explicit for reviewers
    shell: false,
  });

  // Ensure the log directory exists. Fresh `kortext init` projects don't
  // have `.kortext/logs/` yet — the first run would crash with ENOENT
  // (uncaught error event on the WriteStream) before we got the chance to
  // mark the run as failed.
  mkdirSync(dirname(opts.logPath), { recursive: true });
  const log: WriteStream = createWriteStream(opts.logPath, { flags: 'a' });
  log.write(
    `\n# kortext cli-executor — ${new Date().toISOString()}\n# binary: ${opts.binary}\n# args: ${JSON.stringify(opts.args)}\n# cwd: ${opts.cwd}\n\n`,
  );

  // Rolling buffers so we don't OOM on chatty CLIs.
  let stdoutBuf = '';
  let stderrBuf = '';
  const appendCapped = (current: string, chunk: string): string => {
    const combined = current + chunk;
    return combined.length > summaryCap ? combined.slice(combined.length - summaryCap) : combined;
  };

  proc.stdout?.on('data', (chunk: Buffer) => {
    const s = chunk.toString('utf8');
    stdoutBuf = appendCapped(stdoutBuf, s);
    log.write(s);
  });
  proc.stderr?.on('data', (chunk: Buffer) => {
    const s = chunk.toString('utf8');
    stderrBuf = appendCapped(stderrBuf, s);
    log.write(`[stderr] ${s}`);
  });

  // Short-lived CLIs (e.g. `echo X; exit 0`) can close stdin before we
  // finish writing the persona prompt, which surfaces as EPIPE on the
  // parent. The prompt is best-effort — if the child didn't want to read
  // it, we shouldn't crash the test/run with an unhandled error. macOS
  // hides this race because the kernel keeps the pipe buffer alive
  // briefly after exit; Linux closes immediately.
  if (proc.stdin) {
    proc.stdin.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPIPE') {
        log.write(`\n[stdin-error] ${err.message}\n`);
      }
    });
    if (opts.stdin !== undefined) {
      proc.stdin.write(opts.stdin);
    }
    proc.stdin.end();
  }

  let aborted = false;
  let killTimer: NodeJS.Timeout | null = null;
  let timeoutTimer: NodeJS.Timeout | null = null;

  const onAbort = () => {
    aborted = true;
    try {
      proc.kill('SIGTERM');
    } catch {
      /* already gone */
    }
    killTimer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, sigkillDelayMs);
  };
  opts.signal.addEventListener('abort', onAbort, { once: true });

  if (opts.timeoutMs !== undefined) {
    timeoutTimer = setTimeout(() => {
      onAbort();
    }, opts.timeoutMs);
  }

  const result = await new Promise<SpawnCliResult>((resolveResult) => {
    // log.end() flushes asynchronously. On Linux that flush can outlast our
    // promise resolution, leaving callers who readFileSync(logPath) right
    // after await with a half-written file. macOS happens to flush fast
    // enough to hide it. Wait for 'finish' (or the end() callback) before
    // resolving so the file is durable when the caller reads it.
    proc.on('error', (err) => {
      log.write(`\n[spawn-error] ${err.message}\n`);
      log.end(() => {
        resolveResult({
          exitCode: null,
          signal: null,
          stdoutTail: stdoutBuf,
          stderrTail: stderrBuf + `\n[spawn-error] ${err.message}`,
          aborted,
        });
      });
    });
    proc.on('close', (code, signal) => {
      log.write(`\n# exit code=${code} signal=${signal} aborted=${aborted}\n`);
      log.end(() => {
        resolveResult({
          exitCode: code,
          signal,
          stdoutTail: stdoutBuf,
          stderrTail: stderrBuf,
          aborted,
        });
      });
    });
  });

  if (killTimer) clearTimeout(killTimer);
  if (timeoutTimer) clearTimeout(timeoutTimer);
  opts.signal.removeEventListener('abort', onAbort);
  return result;
}

/** Returns the last N non-empty lines as a single newline-joined string. */
export function tailLines(text: string, n: number): string {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.slice(-n).join('\n');
}

// ---------------------------------------------------------------------------
// Transient-failure classification + retry
// ---------------------------------------------------------------------------

/**
 * Markers in the CLI's stdout/stderr that signal a *transient* failure — a
 * network blip, a server-side overload, or a rate-limit — where re-running the
 * exact same step is likely to succeed. Headless agent CLIs on long
 * deep-research steps hit these routinely (the live UAT died on the first one
 * below), so a single blip must not fail the whole workflow run.
 *
 * Deliberately narrow: anything not listed (bad model id, missing binary,
 * auth rejection, declared-output-missing) is treated as deterministic and is
 * NOT retried — re-running it would just burn tokens to fail again.
 */
const TRANSIENT_MARKERS: RegExp[] = [
  /socket connection (?:was )?closed/i,
  /\bapi error\b/i,
  /\beconnreset\b/i,
  /\betimedout\b/i,
  /\beai_again\b/i,
  /fetch failed/i,
  /network error/i,
  /connection (?:error|reset|closed)/i,
  /timed?\s*out/i,
  /overloaded/i,
  /rate.?limit/i,
  /\b429\b/,
  /\b5(?:00|02|03|04|29)\b/,
];

/**
 * Decide whether a finished spawn is a transient failure worth retrying.
 *
 * Never transient when:
 *   - the run was aborted (user/worker cancelled — honour the cancel), or
 *   - the process exited 0 (success — the caller validates outputs separately).
 * Otherwise, transient iff a known marker appears in stdout/stderr.
 */
export function isTransientCliFailure(
  res: Pick<SpawnCliResult, 'exitCode' | 'stdoutTail' | 'stderrTail' | 'aborted'>,
): boolean {
  if (res.aborted) return false;
  if (res.exitCode === 0) return false;
  const haystack = `${res.stdoutTail}\n${res.stderrTail}`;
  return TRANSIENT_MARKERS.some((re) => re.test(haystack));
}

export type SpawnCliRetryOptions = {
  /** Total attempts including the first. 1 = no retry. Default 1. */
  maxAttempts?: number;
  /** Base backoff; attempt k waits base * 2^(k-1) before the next try. Default 1000ms. */
  retryBaseDelayMs?: number;
  /** Injectable sleep so tests don't wait real time. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * `spawnCli` with bounded, exponential-backoff retry on transient failures.
 * Re-spawns the SAME command (the log appends across attempts) until it
 * succeeds, hits a non-transient result, or exhausts `maxAttempts`. Returns the
 * last attempt's result plus the attempt count.
 */
export async function spawnCliWithRetry(
  opts: SpawnCliOptions,
  retry: SpawnCliRetryOptions = {},
): Promise<SpawnCliResult & { attempts: number }> {
  const maxAttempts = Math.max(1, retry.maxAttempts ?? 1);
  const base = retry.retryBaseDelayMs ?? 1000;
  const sleep = retry.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let last!: SpawnCliResult;
  let attempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await spawnCli(opts);
    attempts = attempt;
    if (attempt >= maxAttempts) break;
    if (!isTransientCliFailure(last)) break;
    await sleep(base * 2 ** (attempt - 1));
  }
  return { ...last, attempts };
}
