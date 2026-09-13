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
  /** Some CLIs take the prompt only as an argument. When set, `stdin` goes
   *  after this flag instead of through the pipe — or last, alone, when the
   *  flag is ''. */
  promptFlag?: string;
  /** Environment for the child; the server's own when unset. */
  env?: NodeJS.ProcessEnv;
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
  // A prompt on the command line is untrusted text; the Windows path runs
  // through a shell, so it stays on stdin there or not at all.
  const asArg = opts.promptFlag !== undefined;
  if (asArg && onWindows) throw new Error(`${opts.binary} needs stdin prompts on Windows`);
  const args =
    asArg && opts.stdin !== undefined
      ? [...opts.args, ...(opts.promptFlag ? [opts.promptFlag] : []), opts.stdin]
      : opts.args;
  const stdin = asArg ? undefined : opts.stdin;
  const proc = spawn(opts.binary, args, {
    cwd: opts.cwd,
    env: opts.env,
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
    if (stdin !== undefined) {
      proc.stdin.write(stdin);
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
