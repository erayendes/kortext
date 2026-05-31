import { describe, expect, it } from 'vitest';
import { MockPreviewServer } from '../server/engine/executors/mock-preview-server.ts';
import { PreviewManager } from '../server/orchestrator/test-preview.ts';

describe('PreviewManager — local test URL (§5.9 #7)', () => {
  it('startFor brings up a preview and tracks its url', async () => {
    const server = new MockPreviewServer();
    const mgr = new PreviewManager(server);

    const handle = await mgr.startFor('P1', '/tmp/wt/P1');

    expect(handle.itemId).toBe('P1');
    expect(handle.url).toBeTruthy();
    expect(mgr.urlFor('P1')).toBe(handle.url);
    expect(server.startedFor).toContain('P1');
  });

  it('stopFor tears the preview down and forgets it', async () => {
    const server = new MockPreviewServer();
    const mgr = new PreviewManager(server);
    await mgr.startFor('P2', '/tmp/wt/P2');

    const stopped = await mgr.stopFor('P2');
    expect(stopped).toBe(true);
    expect(server.stoppedFor).toContain('P2');
    expect(mgr.urlFor('P2')).toBeNull();
  });

  it('stopFor on an item with no preview → false (no-op)', async () => {
    const server = new MockPreviewServer();
    const mgr = new PreviewManager(server);
    expect(await mgr.stopFor('nope')).toBe(false);
    expect(server.stoppedFor).toEqual([]);
  });

  it('startFor is idempotent — a second call reuses the running preview', async () => {
    const server = new MockPreviewServer();
    const mgr = new PreviewManager(server);
    const first = await mgr.startFor('P3', '/tmp/wt/P3');
    const second = await mgr.startFor('P3', '/tmp/wt/P3');
    expect(second).toEqual(first);
    expect(server.startedFor).toEqual(['P3']); // spawned once
  });

  it('previews for different items are independent', async () => {
    const server = new MockPreviewServer();
    const mgr = new PreviewManager(server);
    await mgr.startFor('A', '/tmp/wt/A');
    await mgr.startFor('B', '/tmp/wt/B');

    await mgr.stopFor('A');
    expect(mgr.urlFor('A')).toBeNull();
    expect(mgr.urlFor('B')).toBeTruthy(); // B untouched
  });
});
