import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Spawn a CLI with cancellation, timeouts and output logging.
 * Pass binary and arguments separately; POSIX runs without a shell.
 * The Windows shell path requires trusted arguments and sends user prompts through stdin.
 */

export type SpawnCliOptions = {
  binary: string;
  args: string[];
  cwd: string;
  stdin?: string;
  logPath: string;
  signal: AbortSignal;
  /** Delay between SIGTERM and SIGKILL when aborted. Default 1000ms. */
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
  /** True when this run's own timeout killed it, rather than a caller's abort. */
  timedOut: boolean;
};

export async function spawnCli(opts: SpawnCliOptions): Promise<SpawnCliResult> {
  // Keep escalation shorter than the restart/cancel delay before project files are removed.
  const sigkillDelayMs = opts.sigkillDelayMs ?? 1000;
  const summaryCap = opts.summaryBufferBytes ?? 64 * 1024;

  if (opts.signal.aborted) {
    return {
      exitCode: null,
      signal: null,
      stdoutTail: '',
      stderrTail: '',
      aborted: true,
      timedOut: false,
    };
  }

  // Windows support is experimental: .cmd shims require a shell and process-tree termination
  // uses taskkill. Keep binary/arguments trusted and send user-written prompts through stdin.
  const onWindows = process.platform === 'win32';
  const proc = spawn(opts.binary, opts.args, {
    cwd: opts.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: onWindows,
    // Use a POSIX process group to terminate descendants that could keep output pipes open.
    detached: !onWindows,
  });

  const killTree = (sig: NodeJS.Signals) => {
    try {
      if (onWindows) throw new Error('no process groups'); // straight to the fallback
      process.kill(-proc.pid!, sig); // negative pid = the process group
    } catch {
      try {
        proc.kill(sig);
      } catch {
        /* already gone */
      }
    }
  };

  // Create the log directory before opening the stream to prevent an unhandled ENOENT error.
  mkdirSync(dirname(opts.logPath), { recursive: true });
  const log: WriteStream = createWriteStream(opts.logPath, { flags: 'a' });
  log.write(
    `\n# kortext cli-executor — ${new Date().toISOString()}\n# binary: ${opts.binary}\n# args: ${JSON.stringify(opts.args)}\n# cwd: ${opts.cwd}\n\n`,
  );

  // Bound output buffers to limit memory use.
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

  // A child can close stdin before the prompt is written; handle EPIPE without crashing the server.
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
  let timedOut = false;
  let killTimer: NodeJS.Timeout | null = null;
  let timeoutTimer: NodeJS.Timeout | null = null;

  const onAbort = () => {
    aborted = true;
    killTree('SIGTERM');
    killTimer = setTimeout(() => killTree('SIGKILL'), sigkillDelayMs);
  };
  opts.signal.addEventListener('abort', onAbort, { once: true });

  if (opts.timeoutMs !== undefined) {
    timeoutTimer = setTimeout(() => {
      timedOut = true; // the caller aborted nothing; this run outstayed its limit
      onAbort();
    }, opts.timeoutMs);
  }

  const result = await new Promise<SpawnCliResult>((resolveResult) => {
    // Resolve after the log stream finishes so callers can read complete output.
    // Spawn failures emit both error and close; settle once to avoid writes after the log has ended.
    let settled = false;
    const finish = (line: string, result: Omit<SpawnCliResult, 'aborted' | 'timedOut'>) => {
      if (settled) return;
      settled = true;
      log.write(line);
      log.end(() => resolveResult({ ...result, aborted, timedOut }));
    };
    proc.on('error', (err) => {
      finish(`\n[spawn-error] ${err.message}\n`, {
        exitCode: null,
        signal: null,
        stdoutTail: stdoutBuf,
        stderrTail: stderrBuf + `\n[spawn-error] ${err.message}`,
      });
    });
    proc.on('close', (code, signal) => {
      finish(`\n# exit code=${code} signal=${signal} aborted=${aborted}\n`, {
        exitCode: code,
        signal,
        stdoutTail: stdoutBuf,
        stderrTail: stderrBuf,
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
 * Known network, overload and quota markers used by the retry classifiers.
 * Unmatched failures are not classified as transient.
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
  /resource_exhausted/i,
  /\bquota\b/i,
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

/**
 * Detect a non-aborted, successful exit with no meaningful stdout.
 * Callers must validate output files separately; a silent CLI may still have written them.
 */
export function isEmptyOutputExitZero(
  res: Pick<SpawnCliResult, 'exitCode' | 'stdoutTail' | 'aborted'>,
): boolean {
  if (res.aborted) return false;
  if (res.exitCode !== 0) return false;
  return res.stdoutTail.trim().length === 0;
}

/**
 * Classify transient failures, empty successful output and known error markers as recoverable.
 * Aborted runs are never recoverable; this function does not perform retries or select a CLI.
 */
export function isRecoverableCliFailure(
  res: Pick<SpawnCliResult, 'exitCode' | 'stdoutTail' | 'stderrTail' | 'aborted'>,
): boolean {
  if (res.aborted) return false;
  if (isTransientCliFailure(res)) return true;
  if (isEmptyOutputExitZero(res)) return true;
  // Also recognize error markers when the CLI exits successfully with nonempty stdout.
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
