import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { serverUp, waitForServer } from '../server/daemon.js';

const listen = (handler: Parameters<typeof createServer>[0]) =>
  new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });

test('a port with a healthy kortext on it counts as up', async () => {
  const { port, close } = await listen((_req, res) => res.end('{"ok":true}'));
  assert.equal(await serverUp(port), true);
  assert.equal(await waitForServer(port, 1000), true);
  await close();
  // The same port, now refusing connections, is not "still up" from a cached
  // answer — the check is a live request every time.
  assert.equal(await serverUp(port), false);
});

test('waiting on a port nothing listens to gives up instead of hanging', async () => {
  const started = Date.now();
  assert.equal(await waitForServer(1, 300), false);
  assert.ok(Date.now() - started < 5000);
});
