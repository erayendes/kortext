import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { DevServerPreviewServer } from '../server/engine/executors/dev-server-preview-server.ts';

// A real child process that prints a dev-server-style URL line, then stays alive
// until killed — exercises the real spawn → parse → kill machinery deterministically.
const aliveServer = (url: string) => ({
  command: 'node',
  args: ['-e', `console.log('VITE vX ready  Local: ${url}'); setInterval(() => {}, 1000);`],
});

describe('DevServerPreviewServer — real worktree dev-server spawn (capstone C1, §5.9 #7)', () => {
  it('spawns the dev command in the worktree and returns the parsed URL', async () => {
    const server = new DevServerPreviewServer(aliveServer('http://localhost:5199/'));
    const handle = await server.start({ itemId: 'P1', worktreePath: tmpdir() });
    try {
      expect(handle.itemId).toBe('P1');
      expect(handle.url).toBe('http://localhost:5199/');
    } finally {
      await server.stop(handle);
    }
  });

  it('a command that exits before printing a URL → start rejects', async () => {
    const server = new DevServerPreviewServer({ command: 'node', args: ['-e', 'process.exit(2)'] });
    await expect(server.start({ itemId: 'P2', worktreePath: tmpdir() })).rejects.toThrow(/exited|ready/i);
  });

  it('stop kills the running preview (await resolves only once the process exits)', async () => {
    const server = new DevServerPreviewServer(aliveServer('http://localhost:5200/'));
    const handle = await server.start({ itemId: 'P3', worktreePath: tmpdir() });
    // stop awaits the child's exit — resolving proves the process was actually killed.
    await expect(server.stop(handle)).resolves.toBeUndefined();
  });

  it('stop on an unknown item is a no-op', async () => {
    const server = new DevServerPreviewServer(aliveServer('http://localhost:5201/'));
    await expect(server.stop({ itemId: 'GHOST', url: 'x' })).resolves.toBeUndefined();
  });
});
