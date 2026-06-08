import { describe, it, expect } from 'vitest';
import { createServer } from 'node:net';
import { isPortAvailable, findAvailablePort } from '../server/registry/port-probe.ts';

describe('findAvailablePort', () => {
  it('returns the first port at/above `from` when it is free and available', async () => {
    const port = await findAvailablePort({ from: 3200, claimed: [], isAvailable: async () => true });
    expect(port).toBe(3200);
  });

  it('skips ports already claimed in the registry', async () => {
    const port = await findAvailablePort({
      from: 3200,
      claimed: [3200, 3201],
      isAvailable: async () => true,
    });
    expect(port).toBe(3202);
  });

  it('skips ports that are occupied at the OS level even if unclaimed', async () => {
    // 3200 is unclaimed but OS-busy; 3201 is free → should land on 3201.
    const busy = new Set([3200]);
    const port = await findAvailablePort({
      from: 3200,
      claimed: [],
      isAvailable: async (p) => !busy.has(p),
    });
    expect(port).toBe(3201);
  });

  it('combines claimed and OS-busy when choosing', async () => {
    const busy = new Set([3201]);
    const port = await findAvailablePort({
      from: 3200,
      claimed: [3200],
      isAvailable: async (p) => !busy.has(p),
    });
    expect(port).toBe(3202);
  });

  it('throws when no port is available in the range', async () => {
    await expect(
      findAvailablePort({ from: 3200, max: 3202, claimed: [], isAvailable: async () => false }),
    ).rejects.toThrow();
  });
});

describe('isPortAvailable', () => {
  it('returns false for a port that is actively being listened on, true after release', async () => {
    const server = createServer();
    const port: number = await new Promise((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    expect(await isPortAvailable(port)).toBe(false);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortAvailable(port)).toBe(true);
  });
});
