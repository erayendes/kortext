import { spawn, type ChildProcess } from 'node:child_process';
import type { PreviewServer, PreviewStartContext, PreviewHandle } from '../preview-server.ts';

export type DevServerConfig = {
  /** Dev command to spawn, e.g. 'npm'. */
  command: string;
  /** Args, e.g. ['run', 'dev']. */
  args: string[];
  /** Matches the server's "ready" line; capture group 1 is the URL. Default any http(s) URL. */
  urlPattern?: RegExp;
  /** Fail start if no URL appears within this window. Default 30s. */
  readyTimeoutMs?: number;
};

/**
 * Real {@link PreviewServer} (capstone C1) — spawns the project's dev command in
 * the item's worktree and reports the URL it prints, killing it on stop.
 *
 * The engine ({@link PreviewManager}) owns the item→preview bookkeeping; this owns
 * only the substrate. start resolves when the dev server prints its URL (or
 * rejects if it exits / times out first); stop kills the process and resolves once
 * it has actually exited.
 */
export class DevServerPreviewServer implements PreviewServer {
  readonly name = 'dev-server-preview';
  private readonly children = new Map<string, ChildProcess>();

  constructor(private readonly cfg: DevServerConfig) {}

  start(ctx: PreviewStartContext): Promise<PreviewHandle> {
    const pattern = this.cfg.urlPattern ?? /(https?:\/\/\S+)/;
    const timeoutMs = this.cfg.readyTimeoutMs ?? 30_000;
    const child = spawn(this.cfg.command, this.cfg.args, { cwd: ctx.worktreePath });
    this.children.set(ctx.itemId, child);

    return new Promise<PreviewHandle>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        child.kill();
        this.children.delete(ctx.itemId);
        reject(new Error(`preview for ${ctx.itemId} did not become ready in ${timeoutMs}ms`));
      }, timeoutMs);

      const onData = (buf: Buffer) => {
        const m = String(buf).match(pattern);
        if (m && m[1]) {
          cleanup();
          resolve({ itemId: ctx.itemId, url: m[1] });
        }
      };
      const onError = (err: Error) => {
        cleanup();
        this.children.delete(ctx.itemId);
        reject(err);
      };
      const onExit = (code: number | null) => {
        cleanup();
        this.children.delete(ctx.itemId);
        reject(new Error(`preview for ${ctx.itemId} exited before becoming ready (code ${code})`));
      };
      const cleanup = () => {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        child.stderr?.off('data', onData);
        child.off('error', onError);
        child.off('exit', onExit);
      };

      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('error', onError);
      child.on('exit', onExit);
    });
  }

  async stop(handle: PreviewHandle): Promise<void> {
    const child = this.children.get(handle.itemId);
    if (!child) return;
    this.children.delete(handle.itemId);
    if (child.exitCode !== null || child.signalCode !== null) return; // already gone
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
    });
  }
}
