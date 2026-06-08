import { createServer } from 'node:net';
import { BASE_PORT, MAX_PORT } from './projects.ts';

/**
 * Resolve whether a TCP port can actually be bound right now. This is OS truth,
 * not registry bookkeeping — it catches ports held by *any* process (a foreign
 * app, a dev server, a crashed-but-still-listening daemon), which the registry
 * cannot know about.
 *
 * Implemented by attempting to listen and immediately releasing. EADDRINUSE (or
 * EACCES) → unavailable; a clean listen → available.
 *
 * Binds the same way the daemon does — `listen(port)` with no host, so it covers
 * the default dual-stack (`::`) bind. Pinning to a single interface (e.g.
 * 127.0.0.1) would miss a port the daemon would actually collide with.
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

export type FindAvailablePortOptions = {
  from?: number;
  max?: number;
  claimed?: Iterable<number>;
  isAvailable?: (port: number) => Promise<boolean>;
};

/**
 * First port at/above `from` that is neither registry-claimed nor OS-occupied.
 * `isAvailable` is injectable so callers/tests can supply a deterministic probe;
 * the default does a real bind check via {@link isPortAvailable}.
 */
export async function findAvailablePort(opts: FindAvailablePortOptions = {}): Promise<number> {
  const from = opts.from ?? BASE_PORT;
  const max = opts.max ?? MAX_PORT;
  const claimed = new Set(opts.claimed ?? []);
  const isAvailable = opts.isAvailable ?? isPortAvailable;

  for (let p = from; p <= max; p++) {
    if (claimed.has(p)) continue;
    if (await isAvailable(p)) return p;
  }
  throw new Error(
    `no free port in ${from}..${max} — another program may be holding the range; free one with 'kortext remove <project>' / 'kortext stop'`,
  );
}
