import type { PreviewHandle, PreviewServer, PreviewStartContext } from '../preview-server.ts';

/**
 * Deterministic PreviewServer for tests — the preview counterpart of the other
 * mock executors. Returns a fake localhost URL and records start/stop calls so
 * tests can assert the start/stop pairing without spawning a real server.
 */
export class MockPreviewServer implements PreviewServer {
  readonly name = 'mock-preview';
  /** Items start() was called for, in order. */
  readonly startedFor: string[] = [];
  /** Items stop() was called for, in order. */
  readonly stoppedFor: string[] = [];

  private port = 4321;

  async start(ctx: PreviewStartContext): Promise<PreviewHandle> {
    this.startedFor.push(ctx.itemId);
    return { itemId: ctx.itemId, url: `http://localhost:${this.port++}/${ctx.itemId}` };
  }

  async stop(handle: PreviewHandle): Promise<void> {
    this.stoppedFor.push(handle.itemId);
  }
}
